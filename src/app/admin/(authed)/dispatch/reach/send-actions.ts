"use server";

/**
 * Backhaul Reach — the SEND path. One personalized email per broker via the
 * app's Resend integration, reply-to the owner inbox so replies land in Gmail.
 * Nothing sends until the operator taps in the UI. Each successful send is
 * logged to reach_sends, which powers the "reached Nd ago" suppression.
 */

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderTemplate } from "./types";

/** Where "Send test to myself" delivers — the owner's own inbox. */
const TEST_RECIPIENT = "harblancservices@gmail.com";

/**
 * Test recipients. Each gets its OWN separate email (one send() call apiece,
 * mirroring the real blast) so the operator can confirm recipients are never
 * bundled into a shared To/CC. Every address here is explicitly authorized.
 */
const TEST_RECIPIENTS = [TEST_RECIPIENT, "brenth@harblancservices.com"];

/**
 * Put a display name on an address spec. `addressSpec` may be a bare address
 * ("dispatch@x.com") or already "Name <addr>"; either way we keep the address
 * and swap in `name`. Empty name → the spec is returned untouched.
 *
 * Used for both the From and Reply-To so the broker sees the reply-to NAME
 * (e.g. "HARBLANC") as the sender and on replies — the address stays the
 * verified sending domain / owner inbox.
 */
function withDisplayName(name: string, addressSpec: string): string {
  const spec = addressSpec.trim();
  const n = name.trim();
  if (!n) return spec;
  const m = spec.match(/<([^>]+)>/);
  const addr = (m ? m[1] : spec).trim();
  // Quote the name when it contains characters that must be quoted in a header.
  const safe = /[",<>@]/.test(n) ? `"${n.replace(/"/g, "")}"` : n;
  return `${safe} <${addr}>`;
}

export type ReachSendContext = {
  /** Rendered market phrase ({market} token), e.g. "Houston, TX area". */
  market: string;
  /** Equipment/truck line ({equipment} token). */
  equipment: string;
  /** Precision parenthetical ({town_paren} token), possibly "". */
  townParen: string;
  /** Signature MC number ({mc} token), e.g. "1467901". */
  mc: string;
  /** Signature phone ({phone} token), e.g. "832-445-8775". */
  phone: string;
  subjectTemplate: string;
  bodyTemplate: string;
};

export type ReachSendResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; reason: string };

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/** Wrap a plain-text body (newlines → paragraphs) into the outreach email HTML. */
function renderHtml(personalBody: string): string {
  return `<!doctype html><html><body style="margin:0;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;font-size:15px;line-height:1.6">${personalBody
    .split("\n")
    .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
    .join("")}</body></html>`;
}

type BrokerRow = { id: string; name: string | null; email: string | null };
type ContactRow = {
  id: string;
  broker_id: string | null;
  email: string | null;
};

/**
 * Send the outreach to the selected brokers. The client passes broker ids + the
 * chosen posture/leverage template and its resolved token context; the server
 * re-fetches broker names/emails (never trusting client-supplied addresses),
 * renders {broker} per recipient, and logs each success to reach_sends.
 */
export async function sendReach(input: {
  brokerIds: string[];
  posture: string;
  leverage: string;
  marketId: string | null;
  marketName: string;
  /** reach_settings.reply_to_name — the sender/reply display name. */
  replyToName: string;
  ctx: ReachSendContext;
}): Promise<ReachSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const ids = input.brokerIds.map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, reason: "No brokers selected." };
  const subjectTpl = input.ctx.subjectTemplate.trim();
  const bodyTpl = input.ctx.bodyTemplate.trim();
  if (!subjectTpl || !bodyTpl) {
    return { ok: false, reason: "The message template is empty." };
  }

  const sb = createServiceRoleClient();
  const [{ data: brokers }, { data: contactRows }] = await Promise.all([
    sb
      .from("brokers")
      .select("id, name, email")
      .in("id", ids)
      .is("deleted_at", null)
      .returns<BrokerRow[]>(),
    sb
      .from("broker_contacts")
      .select("id, broker_id, email")
      .in("broker_id", ids)
      .eq("is_backhaul", true)
      .is("deleted_at", null)
      .returns<ContactRow[]>(),
  ]);

  // First backhaul-contact email per broker (fallback for a broker with no
  // email of its own); track the contact id for the send log.
  const contactEmail = new Map<string, { email: string; contactId: string }>();
  for (const c of contactRows ?? []) {
    const e = (c.email ?? "").trim();
    if (c.broker_id && e && !contactEmail.has(c.broker_id)) {
      contactEmail.set(c.broker_id, { email: e, contactId: c.id });
    }
  }

  type Recipient = {
    brokerId: string;
    contactId: string | null;
    name: string;
    email: string;
  };
  const recipients: Recipient[] = (brokers ?? [])
    .map((b) => {
      const own = (b.email ?? "").trim();
      const fallback = contactEmail.get(b.id);
      const email = own || fallback?.email || "";
      return {
        brokerId: b.id,
        contactId: own ? null : (fallback?.contactId ?? null),
        name: b.name?.trim() || "there",
        email,
      };
    })
    .filter((r) => r.email.length > 0);
  if (recipients.length === 0) {
    return {
      ok: false,
      reason: "None of the selected brokers have an email on file.",
    };
  }

  const fromSpec =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  const replyAddr = process.env.ADMIN_EMAIL ?? TEST_RECIPIENT;
  // Reply-to NAME becomes the display name on both the From and the Reply-To.
  const from = withDisplayName(input.replyToName, fromSpec);
  const replyTo = withDisplayName(input.replyToName, replyAddr);
  const resend = new Resend(apiKey);

  const base = {
    market: input.ctx.market,
    equipment: input.ctx.equipment,
    townParen: input.ctx.townParen,
    mc: input.ctx.mc,
    phone: input.ctx.phone,
  };

  const nowIso = new Date().toISOString();
  const logRows: Record<string, unknown>[] = [];
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const subject = renderTemplate(subjectTpl, { ...base, broker: r.name });
    const body = renderTemplate(bodyTpl, { ...base, broker: r.name });
    try {
      const res = await resend.emails.send({
        from,
        to: [r.email],
        subject,
        text: body,
        html: renderHtml(body),
        replyTo,
      });
      if (res.error) {
        failed += 1;
      } else {
        sent += 1;
        logRows.push({
          broker_id: r.brokerId,
          broker_contact_id: r.contactId,
          email: r.email,
          market_id: input.marketId,
          market_name: input.marketName,
          posture: input.posture,
          leverage: input.leverage,
          sent_at: nowIso,
        });
      }
    } catch {
      failed += 1;
    }
  }

  // Log successful sends for suppression. Best-effort: a logging failure must
  // not report the emails (already delivered) as failed.
  if (logRows.length > 0) {
    try {
      await sb.from("reach_sends").insert(logRows);
    } catch {
      // reach_sends unavailable (pre-migration) — sends still went out.
    }
  }

  return { ok: true, sent, failed };
}

// ── Test send ────────────────────────────────────────────────────────────────

export type ReachTestResult =
  | { ok: true; to: string[] }
  | { ok: false; reason: string };

/**
 * Send the current rendered outreach to the operator's test inboxes so he can
 * preview exactly what a broker receives AND confirm the blast never bundles
 * recipients. Each address in TEST_RECIPIENTS gets its OWN separate send() call
 * (identical to the real per-broker loop), so the operator receives two
 * distinct emails — neither one lists the other's address. {broker} renders as
 * "there". Only ever goes to the explicitly-authorized test addresses and is
 * never logged.
 */
export async function sendReachTest(
  ctx: ReachSendContext,
  replyToName: string,
): Promise<ReachTestResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const base = {
    market: ctx.market,
    equipment: ctx.equipment,
    townParen: ctx.townParen,
    mc: ctx.mc,
    phone: ctx.phone,
  };
  const subject = renderTemplate(ctx.subjectTemplate, { ...base, broker: "there" }).trim();
  const body = renderTemplate(ctx.bodyTemplate, { ...base, broker: "there" }).trim();
  if (!subject || !body) {
    return { ok: false, reason: "The message template is empty." };
  }

  const fromSpec =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  const replyAddr = process.env.ADMIN_EMAIL ?? TEST_RECIPIENT;
  const from = withDisplayName(replyToName, fromSpec);
  const replyTo = withDisplayName(replyToName, replyAddr);
  const resend = new Resend(apiKey);

  // One independent send per address — the same one-recipient-per-email shape
  // as the real blast, so this genuinely proves recipients aren't bundled.
  const sentTo: string[] = [];
  const failures: string[] = [];
  for (const addr of TEST_RECIPIENTS) {
    try {
      const res = await resend.emails.send({
        from,
        to: [addr],
        subject: `[TEST] ${subject}`,
        text: body,
        html: renderHtml(body),
        replyTo,
      });
      if (res.error) {
        failures.push(`${addr} (${res.error.message ?? "rejected"})`);
      } else {
        sentTo.push(addr);
      }
    } catch (e) {
      failures.push(`${addr} (${e instanceof Error ? e.message : "send failed"})`);
    }
  }

  if (sentTo.length === 0) {
    return {
      ok: false,
      reason: `Send failed: ${failures.join("; ")}`,
    };
  }
  return { ok: true, to: sentTo };
}
