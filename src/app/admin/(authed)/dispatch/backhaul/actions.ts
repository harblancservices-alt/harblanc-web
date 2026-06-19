"use server";

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Backhaul — email selected brokers a truck-availability message. Sent from
 * the dispatch address with reply-to the owner inbox so replies land in
 * Gmail. The operator triggers this from the UI after reviewing the message.
 */

export type BackhaulSendResult =
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

export async function sendBackhaul(
  formData: FormData,
): Promise<BackhaulSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const ids = String(formData.get("broker_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (ids.length === 0) return { ok: false, reason: "No brokers selected." };
  if (!subject || !body) return { ok: false, reason: "Subject and message are required." };

  const sb = createServiceRoleClient();
  const [{ data: brokers }, { data: contactRows }] = await Promise.all([
    sb
      .from("brokers")
      .select("id, name, email")
      .in("id", ids)
      .is("deleted_at", null)
      .returns<{ id: string; name: string | null; email: string | null }[]>(),
    // Only backhaul-flagged contacts can be backhaul recipients.
    sb
      .from("broker_contacts")
      .select("broker_id, email")
      .in("broker_id", ids)
      .eq("is_backhaul", true)
      .is("deleted_at", null)
      .returns<{ broker_id: string | null; email: string | null }[]>(),
  ]);

  // Fall back to a dispatcher contact's email when the broker has no main
  // email (dispatcher emails now live on contacts).
  const contactEmail = new Map<string, string>();
  for (const c of contactRows ?? []) {
    const e = (c.email ?? "").trim();
    if (c.broker_id && e && !contactEmail.has(c.broker_id)) {
      contactEmail.set(c.broker_id, e);
    }
  }

  const recipients = (brokers ?? [])
    .map((b) => ({
      ...b,
      email: (b.email ?? "").trim() || contactEmail.get(b.id) || null,
    }))
    .filter((b) => (b.email ?? "").length > 0);
  if (recipients.length === 0) {
    return { ok: false, reason: "None of the selected brokers have an email on file." };
  }

  const from =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  const replyTo = process.env.ADMIN_EMAIL ?? "harblancservices@gmail.com";
  const resend = new Resend(apiKey);

  let sent = 0;
  let failed = 0;
  for (const b of recipients) {
    const personalBody = body.replace(/\{broker\}/g, b.name ?? "there");
    const html = `<!doctype html><html><body style="margin:0;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;font-size:15px;line-height:1.6">${personalBody
      .split("\n")
      .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
      .join("")}</body></html>`;
    try {
      const res = await resend.emails.send({
        from,
        to: [b.email!.trim()],
        subject,
        text: personalBody,
        html,
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
