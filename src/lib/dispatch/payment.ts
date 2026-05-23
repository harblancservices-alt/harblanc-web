/**
 * Payment summary helper — pure, no database calls, no React, no UI.
 *
 * The lead-status transition `awaiting_payment -> ready_to_dispatch`
 * (Phase P1B) is derived from this summary rather than stored as a
 * separate column. Keeping the computation centralized in one pure
 * function means every callsite (server action, urgency calc, UI
 * badge, future webhook) agrees on what "paid in full" means.
 *
 * Phase P1A is foundation-only: this helper exists so Phase P1B
 * server actions and Phase P1C UI components can import a stable
 * signature without restating the rule inline.
 */

export type PaymentRecord = {
  /** Money received against a finalized quote. Positive only. */
  amount: number;
  /** ISO currency code; today always "USD". */
  currency: string;
  /** Soft-deleted rows must be excluded from the summary at the call site. */
};

export type PaymentSummary = {
  /** finalized_quotes.total_amount (USD by convention). null when the
   *  FQ was sent without a confirmed total — in that case the auto-advance
   *  on paid-in-full does NOT fire (see Phase P1B server-action logic). */
  total: number | null;
  /** Sum of non-deleted payments against this FQ. */
  paid: number;
  /** total - paid. Negative when overpaid (allowed; surfaces as 0 in UI). */
  outstanding: number;
  /** True when total is known and paid >= total. */
  isPaidInFull: boolean;
  /** True when at least one payment has been recorded. Drives "deposit
   *  received" badges without distinguishing deposit vs balance in P1. */
  hasAnyPayment: boolean;
};

/**
 * Compute the payment summary for a finalized quote.
 *
 * `total` is the FQ's total_amount (may be null if the FQ was sent
 * without a confirmed total). `payments` is the list of non-deleted
 * payment rows for that FQ — the caller is responsible for filtering
 * out soft-deleted rows BEFORE passing them in.
 *
 * Rules:
 *   - `paid` is the sum of payment amounts (treated as 0 if the list
 *     is empty).
 *   - `outstanding` is total - paid when total is known; null total
 *     yields outstanding === paid (paid as a negative-direction
 *     indicator; the UI surfaces this as "—" rather than a dollar value).
 *   - `isPaidInFull` requires `total` to be a positive number AND
 *     `paid >= total`. A null total never auto-advances.
 *   - `hasAnyPayment` is true iff paid > 0 (any recorded receipt).
 *
 * Pure: no DB, no I/O, no side effects.
 */
export function computePaymentSummary(
  total: number | null,
  payments: ReadonlyArray<Pick<PaymentRecord, "amount">>,
): PaymentSummary {
  const paid = payments.reduce(
    (sum, p) =>
      sum + (Number.isFinite(p.amount) && p.amount > 0 ? p.amount : 0),
    0,
  );

  const totalIsKnown = typeof total === "number" && Number.isFinite(total) && total > 0;
  const outstanding = totalIsKnown ? Math.max(0, total - paid) : paid;
  const isPaidInFull = totalIsKnown && paid + 1e-6 >= total;

  return {
    total: totalIsKnown ? total : null,
    paid,
    outstanding,
    isPaidInFull,
    hasAnyPayment: paid > 0,
  };
}

/**
 * Human-readable USD formatter. Centralized here so the payment UI
 * (Phase P1C) and the Activity timeline rendering (`describe()` in
 * CommTimeline.tsx) agree on currency presentation.
 */
export function formatPaymentAmount(amount: number, currency: string = "USD"): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Known payment-method codes used by the operator UI. Stored as text
 * in the payments table for forward-compatibility (new channels can
 * be added without an enum migration), but the dropdown is restricted
 * to this list at the input layer.
 */
export const PAYMENT_METHODS = [
  "wire",
  "ach",
  "check",
  "card_in_person",
  "card_phone",
  "other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wire: "Wire transfer",
  ach: "ACH",
  check: "Check",
  card_in_person: "Card — in person",
  card_phone: "Card — phone",
  other: "Other",
};
