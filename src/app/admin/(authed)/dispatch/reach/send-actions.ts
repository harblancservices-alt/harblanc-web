"use server";

/**
 * Backhaul Reach — the SEND path. One personalized email per broker via the
 * app's Resend integration, reply-to the owner inbox so replies land in Gmail.
 * Nothing sends until the operator taps in the UI.
 *
 * Stage 3 wires the live send + preview; recording each send to reach_sends and
 * the "Send test to myself" option are finished in Stage 4.
 */

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderTemplate } from "./types";

export type ReachSendContext = {
  /** Rendered market phrase ({market} token), e.g. "Houston, TX area". */
  market: string;
  /** Equipment/truck line ({equipment} token). */
  equipment: string;
  /** Precision parenthetical ({town_paren} token), possibly "". */
  townParen: string;
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
type ContactRow = { broker_id: string | null; email: string | null };

/**
 * Send the outreach to the selected brokers. The client passes broker ids + the
 * chosen posture/leverage template and its resolved token context; the server
 * re-fetches broker names/emails (never trusting client-supplied addresses) and
 * renders {broker} per recipient.
 */
export async function sendReach(input: {
  brokerIds: string[];
  posture: string;
  leverage: string;
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
      .select("broker_id, email")
      .in("broker_id", ids)
      .eq("is_backhaul", true)
      .is("deleted_at", null)
      .returns<ContactRow[]>(),
  ]);

  // First backhaul-contact email per broker (fallback for a broker with no
  // email of its own).
  const contactEmail = new Map<string, string>();
  for (const c of contactRows ?? []) {
    const e = (c.email ?? "").trim();
    if (c.broker_id && e && !contactEmail.has(c.broker_id)) {
      contactEmail.set(c.broker_id, e);
    }
  }

  const recipients = (brokers ?? [])
    .map((b) => ({
      name: b.name?.trim() || "there",
      email: (b.email ?? "").trim() || contactEmail.get(b.id) || null,
    }))
    .filter((b): b is { name: string; email: string } => !!b.email);
  if (recipients.length === 0) {
    return {
      ok: false,
      reason: "None of the selected brokers have an email on file.",
    };
  }

  const from =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  const replyTo = process.env.ADMIN_EMAIL ?? "harblancservices@gmail.com";
  const resend = new Resend(apiKey);

  const base = {
    market: input.ctx.market,
    equipment: input.ctx.equipment,
    townParen: input.ctx.townParen,
  };

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
      if (res.error) failed += 1;
      else sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok: true, sent, failed };
}
