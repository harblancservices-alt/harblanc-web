"use server";

/**
 * Backhaul Reach — the SEND path. The actual Resend integration, message
 * rendering, and reach_sends logging live in the neutral
 * @/lib/domain/reach/send module, shared with /tms-v2's own wrapper
 * (src/actions/tms-v2/reach.ts) — this file only adds what's specific to
 * /admin: the demo-mode gate. No revalidatePath here, matching the shared
 * module (neither send ever needed it — the composer refreshes client-side).
 */

import { blockedByDemo } from "@/lib/admin/demo";
import {
  sendReach as sendReachShared,
  sendReachTest as sendReachTestShared,
  type ReachSendContext,
  type ReachSendResult,
  type ReachTestResult,
} from "@/lib/domain/reach/send";

/** Where "Send test to myself" delivers — the owner's own inbox. */
const TEST_RECIPIENT = "harblancservices@gmail.com";

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
  replyToName: string;
  replyToEmail?: string;
  ctx: ReachSendContext;
}): Promise<ReachSendResult> {
  // DEMO: never send a real email. Report a benign success shaped like a
  // completed blast, before any Resend/Supabase call.
  if (await blockedByDemo()) {
    const n = input.brokerIds.map((s) => s.trim()).filter(Boolean).length;
    return { ok: true, sent: n, failed: 0 };
  }
  return sendReachShared(input);
}

/**
 * Send the current rendered outreach to the operator's test inbox so he can
 * preview exactly what a broker receives.
 */
export async function sendReachTest(
  ctx: ReachSendContext,
  replyToName: string,
  replyToEmail?: string,
): Promise<ReachTestResult> {
  // DEMO: never send a real test email — report a benign success.
  if (await blockedByDemo()) return { ok: true, to: [TEST_RECIPIENT] };
  return sendReachTestShared(ctx, replyToName, replyToEmail);
}
