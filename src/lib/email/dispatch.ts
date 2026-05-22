import { Resend } from "resend";

/**
 * Server-side helper that fires a dispatch notification email after a
 * quote request lands in Supabase. Designed to fail gracefully: if the
 * Resend API key or the dispatch recipient address isn’t configured,
 * the function returns a structured `{ ok: false, reason }` rather than
 * throwing — the caller should log the reason but must not roll back the
 * database insert (the lead is already captured).
 *
 * Phase 2B updates:
 *   - subject is now "NEW QUOTE — {pickupZip} → {deliveryZip} — {weight}"
 *     so the phone notification preview shows the lane at a glance
 *   - lane (pickup ZIP, delivery ZIP, pickup date) is included in body
 */

export type DispatchPayload = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  pickupZip: string;
  deliveryZip: string;
  pickupDate: string | null;
  notes: string | null;
};

export type DispatchSendResult =
  | { ok: true; emailId: string | null }
  | { ok: false; reason: string };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"\']/g, (c) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "\'": "&#39;",
      } as Record<string, string>
    )[c]!,
  );
}

export async function sendDispatchNotification(
  payload: DispatchPayload,
): Promise<DispatchSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DISPATCH_EMAIL;
  const from =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <onboarding@resend.dev>";

  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured" };
  if (!to) return { ok: false, reason: "DISPATCH_EMAIL not configured" };

  const resend = new Resend(apiKey);

  const subject =
    `NEW QUOTE — ${payload.pickupZip} → ${payload.deliveryZip} — ${payload.weight}`.slice(
      0,
      180,
    );

  const rows: [string, string][] = [
    ["Lane", `${payload.pickupZip} → ${payload.deliveryZip}`],
    ["Pickup date", payload.pickupDate ?? "ASAP"],
    ["Commodity", payload.commodity],
    ["Weight", payload.weight],
    ["Name", payload.name],
    ["Phone", payload.phone],
    ["Email", payload.email],
    ["Notes", payload.notes ?? "(none)"],
    ["Created", payload.createdAt],
    ["Lead ID", payload.id],
  ];

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0a0a0a;color:#e5e5e5;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#171717;border:1px solid #262626;padding:24px">
    <h1 style="margin:0 0 4px;font-size:18px;color:#fff">New quote request</h1>
    <p style="margin:0 0 20px;font-size:13px;color:#a3a3a3">${escapeHtml(payload.pickupZip)} &rarr; ${escapeHtml(payload.deliveryZip)} &middot; ${escapeHtml(payload.weight)}</p>
    <table style="border-collapse:collapse;width:100%">
${rows
  .map(
    ([k, v]) => `      <tr>
        <td style="padding:8px 16px 8px 0;font-size:11px;color:#a3a3a3;text-transform:uppercase;letter-spacing:0.12em;vertical-align:top;border-bottom:1px solid #262626;white-space:nowrap">${escapeHtml(k)}</td>
        <td style="padding:8px 0;font-size:14px;color:#fafafa;vertical-align:top;white-space:pre-wrap;word-break:break-word;border-bottom:1px solid #262626">${escapeHtml(v)}</td>
      </tr>`,
  )
  .join("\n")}
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#737373">Reply to this email to respond directly to ${escapeHtml(payload.email)}.</p>
  </div>
</body></html>`;

  try {
    const result = await resend.emails.send({
      from,
      to: [to],
      subject,
      text,
      html,
      replyTo: payload.email,
    });
    if (result.error) {
      return {
        ok: false,
        reason: result.error.message ?? String(result.error),
      };
    }
    return { ok: true, emailId: result.data?.id ?? null };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
