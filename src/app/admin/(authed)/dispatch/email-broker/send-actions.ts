"use server";

import { blockedByDemo } from "@/lib/admin/demo";
import {
  sendBrokerEmail as sendBrokerEmailShared,
  sendBrokerEmailTest as sendBrokerEmailTestShared,
  type BrokerEmailInput,
  type BrokerSendResult,
} from "@/lib/domain/load-inquiry-send";

/**
 * Email-a-Broker — the SEND path. Core logic lives in
 * @/lib/domain/load-inquiry-send.ts, shared with /tms-v2's
 * src/actions/tms-v2/load-inquiry.ts (decoupling plan Phase 9 / Objective
 * 1A). This file only adds admin's demo-mode gate — no send, real or test,
 * happens while demo mode is on (a benign success is reported to the
 * given address, matching the original behavior).
 */

export async function sendBrokerEmail(
  input: BrokerEmailInput,
): Promise<BrokerSendResult> {
  if (await blockedByDemo()) {
    return { ok: true, to: (input.to ?? "").trim() || "harblancservices@gmail.com" };
  }
  return sendBrokerEmailShared(input);
}

export async function sendBrokerEmailTest(
  input: BrokerEmailInput,
): Promise<BrokerSendResult> {
  if (await blockedByDemo()) {
    return { ok: true, to: "harblancservices@gmail.com" };
  }
  return sendBrokerEmailTestShared(input);
}
