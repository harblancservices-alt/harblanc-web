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
  const rendered = renderEstimateEmail(payload);
  return sendDispatchEstimateBytes({
    to: rendered.to,
    from: rendered.from,
    replyTo: rendered.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

/**
 * Send pre-rendered estimate bytes verbatim. Used by the Quick Estimate
 * workflow so the customer receives the exact preview Brent reviewed,
 * with no re-rendering between Build Preview and Send.
 */
export type DispatchEstimateBytes = {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendDispatchEstimateBytes(
  bytes: DispatchEstimateBytes,
): Promise<EstimateSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured" };

  const resend = new Resend(apiKey);

  try {
    const result = await resend.emails.send({
      from: bytes.from,
      to: [bytes.to],
      subject: bytes.subject,
      text: bytes.text,
      html: bytes.html,
      replyTo: bytes.replyTo,
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
