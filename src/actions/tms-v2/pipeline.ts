"use server";

import { revalidatePath } from "next/cache";
import {
  recordPayment as legacyRecordPayment,
  softDeletePayment as legacySoftDeletePayment,
} from "@/app/admin/(authed)/quotes/payment-actions";
import {
  saveDraftEstimate as legacySaveDraftEstimate,
  buildEstimatePreview as legacyBuildEstimatePreview,
  sendEstimate as legacySendEstimate,
  updateLeadStatus as legacyUpdateLeadStatus,
  type EmailPreview,
} from "@/app/admin/(authed)/quotes/actions";
import {
  generateFinalizedQuoteDraft as legacyGenerateFinalizedQuoteDraft,
  saveFinalizedQuoteDraft as legacySaveFinalizedQuoteDraft,
  buildFinalizedQuotePreview as legacyBuildFinalizedQuotePreview,
  sendFinalizedQuote as legacySendFinalizedQuote,
  type FinalizedQuoteEmailPreview,
} from "@/app/admin/(authed)/quotes/finalized-quote-actions";
import {
  generateBolDraft as legacyGenerateBolDraft,
  saveBolDraft as legacySaveBolDraft,
  buildBolPreview as legacyBuildBolPreview,
  sendBol as legacySendBol,
  type BolEmailPreview,
} from "@/app/admin/(authed)/quotes/bol-actions";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Revenue-workflow writes for /tms-v2 — thin wrappers around V1's
 * lead-to-cash action layer (quotes/{payment,finalized-quote,bol}-actions.ts
 * + actions.ts's estimate functions), per Phase 5B's brief: reuse, don't
 * redesign. These are the most business-critical, most audited functions in
 * the whole app (rate math, PDF/email rendering via Resend, the
 * preview-bytes-== -sent-bytes invariant, the awaiting_payment →
 * ready_to_dispatch auto-advance) — duplicating any of it here would be
 * exactly the kind of drift risk the phase brief warns against. Each
 * wrapper only adds: (a) a try/catch converting V1's throw-on-error
 * functions into MutationResult, and (b) /tms-v2's own revalidatePath
 * targets alongside V1's.
 */

function revalidatePipelinePaths(quoteRequestId?: string) {
  revalidatePath("/tms-v2/operations");
  if (quoteRequestId) revalidatePath(`/tms-v2/operations/${quoteRequestId}`);
  revalidatePath("/tms-v2");
  revalidatePath("/tms-v2/accounting");
}

function toResult(e: unknown): MutationResult {
  return { ok: false, reason: e instanceof Error ? e.message : "Something went wrong. Please try again." };
}

// ── Payment ─────────────────────────────────────────────────────────────

export async function recordPayment(quoteRequestId: string, formData: FormData): Promise<MutationResult> {
  try {
    await legacyRecordPayment(formData);
    revalidatePipelinePaths(quoteRequestId);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function softDeletePayment(paymentId: string, quoteRequestId: string): Promise<MutationResult> {
  try {
    await legacySoftDeletePayment(paymentId);
    revalidatePipelinePaths(quoteRequestId);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

// ── Estimate (range proposal) ───────────────────────────────────────────

export async function saveDraftEstimate(formData: FormData): Promise<MutationResult> {
  try {
    await legacySaveDraftEstimate(formData);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export type PreviewResult = { ok: true; preview: EmailPreview } | { ok: false; reason: string };

export async function buildEstimatePreview(formData: FormData): Promise<PreviewResult> {
  try {
    const preview = await legacyBuildEstimatePreview(formData);
    return { ok: true, preview };
  } catch (e) {
    const r = toResult(e);
    return { ok: false, reason: r.ok ? "" : r.reason };
  }
}

export async function sendEstimate(quoteRequestId: string): Promise<MutationResult> {
  try {
    await legacySendEstimate(quoteRequestId);
    revalidatePipelinePaths(quoteRequestId);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

/** Manual one-tap stage advance (lead_status only — no email/PDF side
 * effects) — ported from V1's Phase 3A updateLeadStatus(), which already
 * logs the transition to dispatch_events. tms-v2's hub previously had no
 * way to move a lead forward except as a side effect of sending an
 * estimate/finalized quote; this is the "advance lead" capability the
 * pipeline strip needs to be more than read-only. */
export async function advanceLeadStatus(quoteRequestId: string, newStatus: string): Promise<MutationResult> {
  try {
    await legacyUpdateLeadStatus(quoteRequestId, newStatus);
    revalidatePipelinePaths(quoteRequestId);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

// ── Finalized quote (rate confirmation) ─────────────────────────────────

export type GenerateDraftResult = { ok: true; id: string } | { ok: false; reason: string };

export async function generateFinalizedQuoteDraft(quoteRequestId: string): Promise<GenerateDraftResult> {
  const res = await legacyGenerateFinalizedQuoteDraft(quoteRequestId);
  if (res.ok) revalidatePipelinePaths(quoteRequestId);
  return res;
}

export async function saveFinalizedQuoteDraft(formData: FormData): Promise<MutationResult> {
  try {
    await legacySaveFinalizedQuoteDraft(formData);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export type FinalizedPreviewResult = { ok: true; preview: FinalizedQuoteEmailPreview } | { ok: false; reason: string };

export async function buildFinalizedQuotePreview(formData: FormData): Promise<FinalizedPreviewResult> {
  try {
    const preview = await legacyBuildFinalizedQuotePreview(formData);
    return { ok: true, preview };
  } catch (e) {
    const r = toResult(e);
    return { ok: false, reason: r.ok ? "" : r.reason };
  }
}

export async function sendFinalizedQuote(finalizedQuoteId: string, quoteRequestId: string): Promise<MutationResult> {
  try {
    await legacySendFinalizedQuote(finalizedQuoteId);
    revalidatePipelinePaths(quoteRequestId);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

// ── Bill of lading ───────────────────────────────────────────────────────

export async function generateBolDraft(quoteRequestId: string): Promise<GenerateDraftResult> {
  const res = await legacyGenerateBolDraft(quoteRequestId);
  if (res.ok) revalidatePipelinePaths(quoteRequestId);
  return res;
}

export async function saveBolDraft(formData: FormData): Promise<MutationResult> {
  try {
    await legacySaveBolDraft(formData);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export type BolPreviewResult = { ok: true; preview: BolEmailPreview } | { ok: false; reason: string };

export async function buildBolPreview(formData: FormData): Promise<BolPreviewResult> {
  try {
    const preview = await legacyBuildBolPreview(formData);
    return { ok: true, preview };
  } catch (e) {
    const r = toResult(e);
    return { ok: false, reason: r.ok ? "" : r.reason };
  }
}

export async function sendBol(bolId: string, quoteRequestId: string): Promise<MutationResult> {
  try {
    await legacySendBol(bolId);
    revalidatePipelinePaths(quoteRequestId);
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}
