"use server";

import {
  sendBrokerEmail as sendBrokerEmailShared,
  sendBrokerEmailTest as sendBrokerEmailTestShared,
  type BrokerEmailInput,
  type BrokerSendResult,
} from "@/lib/domain/load-inquiry-send";

/**
 * Email-a-Broker — the SEND path for /tms-v2. Thin wrapper around the
 * shared core (@/lib/domain/load-inquiry-send.ts), shared with /admin's
 * own wrapper (src/app/admin/(authed)/dispatch/email-broker/send-actions.ts).
 * /tms-v2 has no demo mode, so unlike admin's wrapper this calls the
 * shared core directly with no demo gate — closing the same
 * silent-no-op-under-admin's-demo-cookie bug already fixed for
 * Maintenance (Phase 5A) and the Revenue pipeline (Phase 8): before this
 * change, tms-v2's Load Inquiry composer imported admin's gated
 * sendBrokerEmail/sendBrokerEmailTest directly, so an operator using
 * tms-v2 while admin's `hb-demo` cookie happened to be set would see a
 * "Sent" confirmation for an email that was never actually sent.
 */

export async function sendBrokerEmail(
  input: BrokerEmailInput,
): Promise<BrokerSendResult> {
  return sendBrokerEmailShared(input);
}

export async function sendBrokerEmailTest(
  input: BrokerEmailInput,
): Promise<BrokerSendResult> {
  return sendBrokerEmailTestShared(input);
}
