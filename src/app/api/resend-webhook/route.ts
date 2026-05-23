import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logDispatchEvent } from "@/lib/dispatch/events";

export const runtime = "nodejs";
// We need the raw body for HMAC. Next.js's edge runtime would buffer
// differently; Node runtime gives us a stable `await req.text()`.

/**
 * POST /api/resend-webhook — inbound bounce / complaint ingestion.
 *
 * Phase Q2 — handles ONLY three Resend event types:
 *   - email.bounced            → hard/soft bounce
 *   - email.delivery_delayed   → soft bounce (Resend is still retrying)
 *   - email.complained         → recipient marked as spam
 *
 * Anything else is acknowledged with 200 OK and logged (Resend retries on
 * non-2xx, so silent drops would spam our endpoint).
 *
 * ── Security ─────────────────────────────────────────────────────────
 * Webhook authenticity is verified against the Resend signing secret
 * (RESEND_WEBHOOK_SECRET). Resend uses Standard Webhooks (Svix) format:
 *
 *   svix-id           random message id
 *   svix-timestamp    unix seconds when Resend signed
 *   svix-signature    space-separated list of "v1,<base64 sig>" pairs
 *
 * Signed content is `${msg_id}.${msg_timestamp}.${raw_body}`, HMAC-SHA256
 * keyed by the base64-decoded secret (with the `whsec_` prefix stripped).
 *
 * We refuse to process events when:
 *   - RESEND_WEBHOOK_SECRET is unset (503).
 *   - Any required header is missing (400).
 *   - The timestamp is more than ±5 minutes from now (replay window).
 *   - No candidate signature in the header matches our HMAC (401).
 *
 * Rejecting bad signatures is non-negotiable — a forged "bounce" event
 * would silently mark a healthy send as hard-bounced and poison the
 * operator UI. We will not accept unsigned webhooks even from localhost.
 *
 * ── Idempotency ──────────────────────────────────────────────────────
 * Resend retries on non-2xx, and may occasionally retry on 2xx. If we
 * find the row already has `bounced_at IS NOT NULL`, we DO NOT mutate
 * the row and DO NOT emit a duplicate timeline event. We still return
 * 200 so Resend stops retrying.
 *
 * Complaints are treated slightly differently: a complaint can arrive
 * after a bounce (or vice versa). If `bounce_kind = 'complaint'` is
 * already set, complaints are idempotent; otherwise they overwrite a
 * prior 'soft' bounce (a complaint is operationally more severe).
 *
 * ── What we DO NOT do ────────────────────────────────────────────────
 *   - No queue / no retry buffer. If a row update fails we log and 500;
 *     Resend's built-in retries are sufficient.
 *   - No suppression list, open/click tracking, or delivered confirmation.
 *   - No auto-resend on bounce. Operator initiates resends manually
 *     via the Phase Q1 Resend button.
 */

// 5-minute tolerance for clock skew between Resend and us.
const REPLAY_TOLERANCE_SECONDS = 5 * 60;

type ResendBounceType = "Permanent" | "Transient" | "Undetermined" | string;

type ResendBounceShape = {
  type?: ResendBounceType;
  subType?: string;
  message?: string;
};

type ResendDataShape = {
  email_id?: unknown;
  to?: unknown; // string | string[]
  subject?: unknown;
  bounce?: ResendBounceShape;
};

type ResendEventShape = {
  type?: unknown;
  created_at?: unknown;
  data?: ResendDataShape;
};

type MatchedDoc =
  | { docType: "estimate"; docId: string; docNumber: null; quoteRequestId: string }
  | { docType: "finalized_quote"; docId: string; docNumber: string; quoteRequestId: string }
  | { docType: "bol"; docId: string; docNumber: string; quoteRequestId: string };

/**
 * Verify the Standard Webhooks signature on a Resend webhook delivery.
 * Returns true on a valid signature within the replay window.
 */
function verifySignature(
  rawBody: string,
  msgId: string,
  msgTimestamp: string,
  msgSignatureHeader: string,
  secret: string,
): boolean {
  // Timestamp must be a unix-seconds integer within tolerance.
  const ts = Number.parseInt(msgTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > REPLAY_TOLERANCE_SECONDS) return false;

  // Strip the whsec_ prefix and base64-decode the secret bytes.
  const stripped = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Buffer;
  try {
    keyBytes = Buffer.from(stripped, "base64");
  } catch {
    return false;
  }
  if (keyBytes.length === 0) return false;

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const expectedB64 = createHmac("sha256", keyBytes)
    .update(signedContent)
    .digest("base64");
  const expectedBuf = Buffer.from(expectedB64, "base64");

  // Header format: "v1,<sig> v1,<sig2> v2,<sig3>" — Resend currently
  // emits a single v1 entry but the spec permits multiples (rotation).
  // We accept any v1 entry that matches.
  const candidates = msgSignatureHeader.split(" ");
  for (const candidate of candidates) {
    const idx = candidate.indexOf(",");
    if (idx === -1) continue;
    const version = candidate.slice(0, idx);
    if (version !== "v1") continue;
    const sigB64 = candidate.slice(idx + 1);
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sigB64, "base64");
    } catch {
      continue;
    }
    if (sigBuf.length !== expectedBuf.length) continue;
    if (timingSafeEqual(sigBuf, expectedBuf)) return true;
  }
  return false;
}

/**
 * Locate the deliverable row by sent_email_id. Returns null if no row
 * in any of the three tables matches — the webhook was for a send we
 * don't track (or we lost it). Caller logs + returns 200.
 */
async function locateByEmailId(
  sb: ReturnType<typeof createServiceRoleClient>,
  emailId: string,
): Promise<
  | (MatchedDoc & {
      bouncedAt: string | null;
      bounceKind: string | null;
    })
  | null
> {
  // dispatch_estimates first — they don't have a doc number.
  {
    const { data } = await sb
      .from("dispatch_estimates")
      .select("id, quote_request_id, bounced_at, bounce_kind")
      .eq("sent_email_id", emailId)
      .maybeSingle<{
        id: string;
        quote_request_id: string;
        bounced_at: string | null;
        bounce_kind: string | null;
      }>();
    if (data) {
      return {
        docType: "estimate",
        docId: data.id,
        docNumber: null,
        quoteRequestId: data.quote_request_id,
        bouncedAt: data.bounced_at,
        bounceKind: data.bounce_kind,
      };
    }
  }
  // Then finalized_quotes.
  {
    const { data } = await sb
      .from("finalized_quotes")
      .select(
        "id, finalized_quote_number, quote_request_id, bounced_at, bounce_kind",
      )
      .eq("sent_email_id", emailId)
      .maybeSingle<{
        id: string;
        finalized_quote_number: string;
        quote_request_id: string;
        bounced_at: string | null;
        bounce_kind: string | null;
      }>();
    if (data) {
      return {
        docType: "finalized_quote",
        docId: data.id,
        docNumber: data.finalized_quote_number,
        quoteRequestId: data.quote_request_id,
        bouncedAt: data.bounced_at,
        bounceKind: data.bounce_kind,
      };
    }
  }
  // Finally bills_of_lading.
  {
    const { data } = await sb
      .from("bills_of_lading")
      .select("id, bol_number, quote_request_id, bounced_at, bounce_kind")
      .eq("sent_email_id", emailId)
      .maybeSingle<{
        id: string;
        bol_number: string;
        quote_request_id: string;
        bounced_at: string | null;
        bounce_kind: string | null;
      }>();
    if (data) {
      return {
        docType: "bol",
        docId: data.id,
        docNumber: data.bol_number,
        quoteRequestId: data.quote_request_id,
        bouncedAt: data.bounced_at,
        bounceKind: data.bounce_kind,
      };
    }
  }
  return null;
}

function tableNameFor(docType: MatchedDoc["docType"]): string {
  switch (docType) {
    case "estimate":
      return "dispatch_estimates";
    case "finalized_quote":
      return "finalized_quotes";
    case "bol":
      return "bills_of_lading";
  }
}

function normalizeRecipient(to: unknown): string {
  if (typeof to === "string") return to;
  if (Array.isArray(to) && to.length > 0 && typeof to[0] === "string") {
    return to.join(", ");
  }
  return "";
}

function classifyBounce(bounceType: string | undefined | null): "hard" | "soft" {
  // Resend marks Permanent failures as hard; everything else is treated
  // as transient (soft) — including the "Undetermined" status, which we
  // refuse to escalate without explicit signal.
  if (bounceType === "Permanent") return "hard";
  return "soft";
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret || secret.trim().length === 0) {
    // Refuse to process anything without a signing key. This is a
    // 503-style operator-misconfiguration state, not a 4xx — the
    // request itself may be fine.
    return NextResponse.json(
      { ok: false, reason: "RESEND_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  // Read raw body BEFORE JSON parsing — HMAC is computed over raw bytes.
  const rawBody = await req.text();

  const msgId = req.headers.get("svix-id");
  const msgTimestamp = req.headers.get("svix-timestamp");
  const msgSignature = req.headers.get("svix-signature");

  if (!msgId || !msgTimestamp || !msgSignature) {
    return NextResponse.json(
      { ok: false, reason: "missing svix headers" },
      { status: 400 },
    );
  }

  if (!verifySignature(rawBody, msgId, msgTimestamp, msgSignature, secret)) {
    return NextResponse.json(
      { ok: false, reason: "invalid signature" },
      { status: 401 },
    );
  }

  // Signature verified — safe to parse.
  let payload: ResendEventShape;
  try {
    payload = JSON.parse(rawBody) as ResendEventShape;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid JSON" },
      { status: 400 },
    );
  }

  const eventType = typeof payload.type === "string" ? payload.type : "";
  const data: ResendDataShape = payload.data ?? {};
  const emailId = typeof data.email_id === "string" ? data.email_id : "";

  // Unsupported event types: acknowledge with 200 (Resend will stop
  // retrying) but log so we can spot configuration drift.
  if (
    eventType !== "email.bounced" &&
    eventType !== "email.delivery_delayed" &&
    eventType !== "email.complained"
  ) {
    console.warn("[resend-webhook] unsupported event type", { eventType });
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!emailId) {
    console.warn("[resend-webhook] event missing email_id", { eventType });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const sb = createServiceRoleClient();
  const match = await locateByEmailId(sb, emailId);

  if (!match) {
    // Not one of ours — probably a stale send, or a send from a different
    // environment sharing the same Resend project. Acknowledge.
    console.warn("[resend-webhook] no row matched email_id", {
      eventType,
      emailId,
    });
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const recipient = normalizeRecipient(data.to);
  const upstreamMessage =
    typeof data.bounce?.message === "string" ? data.bounce.message : null;

  // Branch by event type.
  if (eventType === "email.complained") {
    if (match.bounceKind === "complaint") {
      // Already marked. Idempotent no-op.
      return NextResponse.json({ ok: true, idempotent: true });
    }
    const { error: updErr } = await sb
      .from(tableNameFor(match.docType))
      .update({
        bounced_at: new Date().toISOString(),
        bounce_kind: "complaint",
        bounce_reason: upstreamMessage,
      })
      .eq("id", match.docId);
    if (updErr) {
      console.error("[resend-webhook] update failed (complained)", {
        docType: match.docType,
        docId: match.docId,
        code: updErr.code,
        message: updErr.message,
      });
      return NextResponse.json(
        { ok: false, reason: "row update failed" },
        { status: 500 },
      );
    }
    await logDispatchEvent(sb, match.quoteRequestId, "email_complained", {
      docType: match.docType,
      docId: match.docId,
      docNumber: match.docNumber,
      emailId,
      to: recipient,
    });
    return NextResponse.json({ ok: true });
  }

  // From here: email.bounced or email.delivery_delayed → bounce_kind.
  if (match.bouncedAt && match.bounceKind && match.bounceKind !== "soft") {
    // Already terminal (hard or complaint). Don't downgrade.
    return NextResponse.json({ ok: true, idempotent: true });
  }

  let kind: "hard" | "soft";
  if (eventType === "email.bounced") {
    kind = classifyBounce(data.bounce?.type);
  } else {
    // delivery_delayed → Resend is still trying. Soft.
    kind = "soft";
  }

  // Don't overwrite an existing soft bounce with another soft bounce —
  // emit a no-op so the timeline isn't spammed by Resend's retry loop.
  // (A hard bounce after a soft IS allowed; the check above let it
  // through because match.bounceKind was 'soft' or null.)
  if (match.bounceKind === "soft" && kind === "soft") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const { error: updErr } = await sb
    .from(tableNameFor(match.docType))
    .update({
      bounced_at: new Date().toISOString(),
      bounce_kind: kind,
      bounce_reason: upstreamMessage,
    })
    .eq("id", match.docId);
  if (updErr) {
    console.error("[resend-webhook] update failed (bounce)", {
      docType: match.docType,
      docId: match.docId,
      code: updErr.code,
      message: updErr.message,
    });
    return NextResponse.json(
      { ok: false, reason: "row update failed" },
      { status: 500 },
    );
  }

  // Emit the typed bounce event. Three branches because the payload
  // schema is different per doc type (estimates have no doc number).
  if (match.docType === "estimate") {
    await logDispatchEvent(sb, match.quoteRequestId, "estimate_bounced", {
      estimateId: match.docId,
      emailId,
      to: recipient,
      kind,
      reason: upstreamMessage,
    });
  } else if (match.docType === "finalized_quote") {
    await logDispatchEvent(
      sb,
      match.quoteRequestId,
      "finalized_quote_bounced",
      {
        finalizedQuoteId: match.docId,
        finalizedQuoteNumber: match.docNumber,
        emailId,
        to: recipient,
        kind,
        reason: upstreamMessage,
      },
    );
  } else {
    await logDispatchEvent(sb, match.quoteRequestId, "bol_bounced", {
      bolId: match.docId,
      bolNumber: match.docNumber,
      emailId,
      to: recipient,
      kind,
      reason: upstreamMessage,
    });
  }

  return NextResponse.json({ ok: true });
}
