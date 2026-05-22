import { Resend } from "resend";
import { renderEstimateEmail, type EstimatePayload } from "./render";

/**
 * Dispatch estimate email — Resend delivery wrapper.
 *
 * All rendering lives in render.ts so the same code path produces both
 * the inline admin preview and the bytes sent to the customer. This
 * file only handles delivery.
 */

export type { EstimatePayload } from "./render";

export type EstimateSendResult =
  | { ok: true; emailId: string | null }
  | { ok: false; reason: string };

export async function sendDispatchEstimate(
  payload: EstimatePayload,
): Promise<EstimateSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured" };

  const rendered = renderEstimateEmail(payload);
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
