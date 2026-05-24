"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import {
  recordPayment,
  softDeletePayment,
} from "../payment-actions";
import {
  computePaymentSummary,
  formatPaymentAmount,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/dispatch/payment";

/**
 * Phase P1C — Payment section UI.
 *
 * Renders an operational subsection inside the Finalized Quote tab:
 *
 *   1. Header + outstanding-balance summary card with status badge
 *   2. Inline "Record payment" form (collapsed by default)
 *   3. Payment history list, newest first, including soft-deleted rows
 *
 * Payments are scoped to the LATEST SENT finalized quote on the lead.
 * If there's no sent FQ yet (or the lead is trashed), the parent
 * decides whether to render this component at all — this file assumes
 * a valid `target` has been provided.
 *
 * No logic changes in this file: the heavy lifting (validation,
 * status auto-advance, event emission) is in payment-actions.ts.
 * This is pure presentation + form submission.
 */

export type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  receivedAt: string;
  method: string;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  recordedAt: string;
  deletedAt: string | null;
};

export type PaymentTarget = {
  finalizedQuoteId: string;
  finalizedQuoteNumber: string;
  totalAmount: number | null;
  payments: PaymentRow[];
};

export function PaymentSection({
  quoteRequestId,
  target,
}: {
  quoteRequestId: string;
  target: PaymentTarget;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Only non-deleted payments contribute to the summary.
  const activePayments = target.payments.filter((p) => p.deletedAt === null);
  const summary = computePaymentSummary(
    target.totalAmount,
    activePayments.map((p) => ({ amount: p.amount, currency: p.currency })),
  );

  // Status badge: unpaid (no payments), partial (some paid, not full), paid (>= total).
  const badge = badgeFor(summary);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("finalized_quote_id", target.finalizedQuoteId);
    fd.set("quote_request_id", quoteRequestId);
    setError(null);
    startTransition(async () => {
      try {
        await recordPayment(fd);
        // Collapse form, reset, refresh.
        (e.target as HTMLFormElement).reset();
        setFormOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record payment.");
      }
    });
  }

  function onSoftDelete(paymentId: string, amountLabel: string) {
    if (!confirm(`Soft-delete this payment (${amountLabel})?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await softDeletePayment(paymentId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete payment.");
      }
    });
  }

  return (
    <section className="space-y-5">
      <header className="border-b border-zinc-200 pb-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900">
            Payments
          </h2>
          <span
            className={
              "inline-flex items-center border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] " +
              badge.classes
            }
          >
            {badge.label}
          </span>
        </div>
      </header>

      {/* Summary card */}
      <div className="grid grid-cols-1 gap-px border border-zinc-300 bg-zinc-300 sm:grid-cols-3">
        <SummaryCell
          label="Finalized total"
          value={
            summary.total !== null
              ? formatPaymentAmount(summary.total)
              : "—"
          }
        />
        <SummaryCell
          label="Paid so far"
          value={formatPaymentAmount(summary.paid)}
          accent={summary.hasAnyPayment ? "green" : "neutral"}
        />
        <SummaryCell
          label="Outstanding"
          value={
            summary.total !== null
              ? formatPaymentAmount(Math.max(0, summary.outstanding))
              : "—"
          }
          accent={
            summary.isPaidInFull
              ? "green"
              : summary.hasAnyPayment
                ? "amber"
                : "red"
          }
        />
      </div>

      {summary.isPaidInFull ? (
        <div className="border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-xs font-semibold tracking-[0.12em] text-emerald-800 uppercase">
            Paid in full · Ready to dispatch
          </p>
          <p className="mt-2 text-sm leading-relaxed text-emerald-900">
            {target.finalizedQuoteNumber} is paid in full. Lead status was
            advanced to Ready to dispatch automatically when payment cleared.
          </p>
        </div>
      ) : null}

      {/* Record payment toggle + inline form */}
      {!formOpen ? (
        <div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="btn-outline-cut inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-zinc-100 uppercase transition-colors hover:text-white"
          >
            + Record payment
          </button>
        </div>
      ) : (
        <RecordPaymentForm
          quoteRequestId={quoteRequestId}
          finalizedQuoteNumber={target.finalizedQuoteNumber}
          outstanding={summary.outstanding}
          onSubmit={onSubmit}
          onCancel={() => {
            setFormOpen(false);
            setError(null);
          }}
          isPending={isPending}
          error={error}
        />
      )}

      {!formOpen && error ? (
        <div role="alert" className="flex items-start gap-3 border border-red-300 bg-red-50 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-800">{error}</p>
        </div>
      ) : null}

      {/* History */}
      {target.payments.length === 0 ? (
        <p className="text-sm text-zinc-600">
          No payments recorded yet against {target.finalizedQuoteNumber}.
        </p>
      ) : (
        <ul className="border border-zinc-200 bg-zinc-50">
          {target.payments.map((p, i) => (
            <li
              key={p.id}
              className={
                "grid grid-cols-1 gap-2 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-start sm:px-5 " +
                (i > 0 ? "border-t border-zinc-200 " : "") +
                (p.deletedAt !== null ? "opacity-50" : "")
              }
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={
                      "font-mono text-base font-semibold " +
                      (p.deletedAt !== null
                        ? "text-zinc-600 line-through"
                        : "text-zinc-900")
                    }
                  >
                    {formatPaymentAmount(p.amount, p.currency)}
                  </span>
                  <span className="text-xs font-semibold tracking-[0.12em] text-zinc-700 uppercase">
                    via {prettyMethod(p.method)}
                  </span>
                  {p.deletedAt !== null ? (
                    <span className="inline-flex items-center border border-zinc-300 bg-white px-2 py-0.5 text-xs font-semibold tracking-[0.12em] text-zinc-600 uppercase">
                      Deleted
                    </span>
                  ) : null}
                </div>
                <p
                  className="font-mono text-xs text-zinc-600"
                  title={formatDateFull(p.receivedAt)}
                >
                  Received {relativeTime(p.receivedAt)}{" "}
                  <span aria-hidden className="mx-1 text-zinc-600">·</span>{" "}
                  {formatDateFull(p.receivedAt)}
                </p>
                {p.reference ? (
                  <p className="font-mono text-xs text-zinc-600">
                    Ref: {p.reference}
                  </p>
                ) : null}
                {p.notes ? (
                  <p className="text-xs text-zinc-600 whitespace-pre-wrap">
                    {p.notes}
                  </p>
                ) : null}
                <p className="font-mono text-xs text-zinc-600">
                  Recorded {relativeTime(p.recordedAt)}
                  {p.recordedBy ? ` · by ${p.recordedBy.slice(0, 8)}` : ""}
                </p>
              </div>
              {p.deletedAt === null ? (
                <div className="flex items-start sm:justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onSoftDelete(
                        p.id,
                        formatPaymentAmount(p.amount, p.currency),
                      )
                    }
                    disabled={isPending}
                    className="border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-600 uppercase transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function SummaryCell({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: "neutral" | "green" | "amber" | "red";
}) {
  const valueColor =
    accent === "green"
      ? "text-emerald-800"
      : accent === "amber"
        ? "text-amber-800"
        : accent === "red"
          ? "text-red-700"
          : "text-zinc-900";
  return (
    <div className="bg-white p-4 sm:p-5">
      <p className="label-cap text-zinc-600">{label}</p>
      <p className={"mt-2 font-mono text-2xl font-semibold " + valueColor}>
        {value}
      </p>
    </div>
  );
}

function RecordPaymentForm({
  quoteRequestId,
  finalizedQuoteNumber,
  outstanding,
  onSubmit,
  onCancel,
  isPending,
  error,
}: {
  quoteRequestId: string;
  finalizedQuoteNumber: string;
  outstanding: number;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultAmount =
    outstanding > 0 ? outstanding.toFixed(2) : "";

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 border border-zinc-300 bg-white p-5 shadow-md shadow-black/30 sm:p-6"
    >
      <header>
        <p className="text-xs font-semibold tracking-[0.12em] text-red-600 uppercase">
          Record payment
        </p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600">
          Against {finalizedQuoteNumber}.{" "}
          {outstanding > 0
            ? `Outstanding ${formatPaymentAmount(outstanding)}.`
            : "Already paid in full — recording an over-payment is allowed."}
        </p>
      </header>

      {/* hidden — set by the submit handler so we don't trust client editing */}
      <input
        type="hidden"
        name="quote_request_id"
        defaultValue={quoteRequestId}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount (USD)" required>
          <input
            type="number"
            inputMode="decimal"
            name="amount"
            min="0.01"
            step="0.01"
            defaultValue={defaultAmount}
            required
            className="block w-full bg-white border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-red-600 focus:outline-none"
            placeholder="0.00"
          />
        </Field>
        <Field label="Received on" required>
          <input
            type="date"
            name="received_at"
            defaultValue={today}
            required
            className="block w-full bg-white border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 focus:border-red-600 focus:outline-none"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Method" required>
          <select
            name="method"
            defaultValue="wire"
            required
            className="block w-full bg-white border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 focus:border-red-600 focus:outline-none"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m} className="bg-white">
                {PAYMENT_METHOD_LABELS[m as PaymentMethod]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference">
          <input
            type="text"
            name="reference"
            className="block w-full bg-white border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-red-600 focus:outline-none"
            placeholder="Wire conf, check #, last-4..."
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          name="notes"
          rows={2}
          className="block w-full bg-white border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-red-600 focus:outline-none resize-y"
          placeholder="Any context that won't be obvious later..."
        />
      </Field>

      {error ? (
        <div role="alert" className="flex items-start gap-3 border border-red-300 bg-red-50 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-800">{error}</p>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-zinc-600">
        Recording a payment that brings the finalized quote to paid-in-full
        will automatically advance this lead to{" "}
        <span className="text-zinc-700">Ready to dispatch</span>.
      </p>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-zinc-300 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Recording..." : "Record payment"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label-cap">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function badgeFor(summary: {
  total: number | null;
  paid: number;
  isPaidInFull: boolean;
  hasAnyPayment: boolean;
}): { label: string; classes: string } {
  if (summary.total === null) {
    return {
      label: "Total not set",
      classes: "border-zinc-300 bg-white text-zinc-600",
    };
  }
  if (summary.isPaidInFull) {
    return {
      label: "Paid in full",
      classes: "border-emerald-300 bg-emerald-50 text-emerald-800",
    };
  }
  if (summary.hasAnyPayment) {
    return {
      label: "Partial",
      classes: "border-amber-300 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: "Unpaid",
    classes: "border-red-300 bg-red-50 text-red-700",
  };
}

function prettyMethod(method: string): string {
  // Method codes are snake_case; display them human-readably without
  // hard-coding the full map (forward-compatible with unknown methods).
  if (method in PAYMENT_METHOD_LABELS) {
    return PAYMENT_METHOD_LABELS[method as PaymentMethod];
  }
  return method.replace(/_/g, " ");
}
