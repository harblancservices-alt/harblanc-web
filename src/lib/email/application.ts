import { Resend } from "resend";

/**
 * Server-side helper that fires a recruiting notification email after an
 * owner-operator application lands in Supabase. Mirrors the dispatch
 * notification pattern: fails gracefully if Resend / DISPATCH_EMAIL are
 * not configured. Never throws.
 */

export type ApplicationPayload = {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  equipmentType: string;
  cdlStatus: string;
  yearsExperience: string | null;
  homeBase: string | null;
  message: string | null;
};

export type ApplicationSendResult =
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

export async function sendApplicationNotification(
  payload: ApplicationPayload,
): Promise<ApplicationSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DISPATCH_EMAIL;
  const from =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <onboarding@resend.dev>";

  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured" };
  if (!to) return { ok: false, reason: "DISPATCH_EMAIL not configured" };

  const resend = new Resend(apiKey);

  const subject = `New application: ${payload.name} — ${payload.equipmentType}`.slice(
    0,
    180,
  );

  const rows: [string, string][] = [
    ["Name", payload.name],
    ["Phone", payload.phone],
    ["Email", payload.email],
    ["Equipment", payload.equipmentType],
    ["CDL", payload.cdlStatus],
    ["Experience", payload.yearsExperience ?? "—"],
    ["Home base", payload.homeBase ?? "—"],
    ["Message", payload.message ?? "—"],
    ["Lead ID", payload.id],
    ["Received", payload.createdAt],
  ];

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;color:#111;line-height:1.55;font-size:14px;">
      <p style="margin:0 0 16px;font-weight:600;font-size:15px;">New owner-operator application</p>
      <table style="border-collapse:collapse;">
        ${rows
          .map(
            ([k, v]) => `
          <tr>
            <td style="padding:4px 16px 4px 0;color:#666;vertical-align:top;">${escapeHtml(
              k,
            )}</td>
            <td style="padding:4px 0;color:#111;">${escapeHtml(v)}</td>
          </tr>`,
          )
          .join("")}
      </table>
    </div>
  `;

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
      text,
      replyTo: payload.email,
    });
    if (error) return { ok: false, reason: error.message };
    return { ok: true, emailId: data?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown error",
    };
  }
}
