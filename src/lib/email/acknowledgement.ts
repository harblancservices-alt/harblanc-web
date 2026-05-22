import { Resend } from "resend";
import { renderAcknowledgementEmail, type AcknowledgementPayload } from "./render";

/**
 * Customer acknowledgement email — Resend delivery wrapper.
 *
 * All the rendering logic lives in render.ts (so it can also be called
 * by the admin preview action). This file only deals with delivery.
 */

export type { AcknowledgementPayload } from "./render";

export type AcknowledgementSendResult =
  | { ok: true; emailId: string | null }
  | { ok: false; reason: string };

export async function sendCustomerAcknowledgement(
  payload: AcknowledgementPayload,
): Promise<AcknowledgementSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured" };

  const rendered = renderAcknowledgementEmail(payload);
  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: rendered.from,
      to: [rendered.to],
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      replyTo: rendered.replyTo,
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
