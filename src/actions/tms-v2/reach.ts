"use server";

import { revalidatePath } from "next/cache";
import {
  updateReachSettings as updateReachSettingsShared,
  saveReachStyleEmail as saveReachStyleEmailShared,
  type SettingsInput,
} from "@/lib/domain/reach/settings";
import {
  sendReach as sendReachShared,
  sendReachTest as sendReachTestShared,
  type ReachSendContext,
  type ReachSendResult,
  type ReachTestResult,
} from "@/lib/domain/reach/send";

/**
 * Backhaul Reach writes for /tms-v2 — thin wrappers around the neutral
 * settings/template core (src/lib/domain/reach/settings.ts) and the neutral
 * Resend send core (src/lib/domain/reach/send.ts), shared with /admin's own
 * wrappers (src/app/admin/(authed)/dispatch/reach/actions.ts and
 * send-actions.ts). /tms-v2 has no demo mode of its own, so unlike admin's
 * wrappers these call the shared core directly with no demo gate.
 *
 * SAFETY: sendReach/sendReachTest below make REAL outbound Resend calls with
 * no demo gate at all (by design — matches every other tms-v2 write
 * wrapper in this codebase). There is no dry-run/sandbox mode in this
 * integration; the only thing that ever prevented a real send was admin's
 * demo cookie, which this file deliberately does not check (that cookie has
 * no meaning for tms-v2). Do not call these from tests or scripts.
 */

function revalidateReachPaths() {
  revalidatePath("/tms-v2/reach");
  revalidatePath("/tms-v2");
}

export async function updateReachSettings(
  input: SettingsInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = await updateReachSettingsShared(input);
  if (result.ok) revalidateReachPaths();
  return result;
}

export async function saveReachStyleEmail(
  posture: string,
  leverage: string,
  input: { subject: string; body: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = await saveReachStyleEmailShared(posture, leverage, input);
  if (result.ok) revalidateReachPaths();
  return result;
}

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
  return sendReachShared(input);
}

export async function sendReachTest(
  ctx: ReachSendContext,
  replyToName: string,
  replyToEmail?: string,
): Promise<ReachTestResult> {
  return sendReachTestShared(ctx, replyToName, replyToEmail);
}
