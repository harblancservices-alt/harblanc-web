"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { recordPayment, softDeletePayment } from "@/actions/tms-v2/pipeline";
import type { MutationResult } from "@/lib/demo/mutation";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/dispatch/payment";
import type { PaymentEntry, FinalizedQuoteSummary } from "@/lib/data/pipeline";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

/** Record a customer payment against a finalized quote — the hinge of the
 * whole sales-to-cash pipeline (audit's single most operationally
 * significant dead function: recordPayment had zero callers anywhere,
 * legacy included). Recording enough to close the balance auto-advances
 * the lead awaiting_payment → ready_to_dispatch. Undo (softDeletePayment)
 * is the reversible half. */
export function PaymentSection({
  quoteRequestId,
  finalizedQuotes,
  entries,
}: {
  quoteRequestId: string;
  finalizedQuotes: FinalizedQuoteSummary[];
  entries: PaymentEntry[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const sentQuotes = finalizedQuotes.filter((f) => f.sentAt != null);

  // Side effects run inline in the action itself, not a `useEffect` keyed on
  // `state.ok` — see LoadFormModal.tsx for why.
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await recordPayment(quoteRequestId, formData);
    if (!result.ok) return { ok: false, error: result.reason };
    setAdding(false);
    router.refresh();
    return { ok: true, error: null };
  }, INITIAL);

  async function onUndo(paymentId: string) {
    if (!confirm("Undo this payment? This does not roll back an auto-advanced lead status.")) return;
    setUndoError(null);
    const result: MutationResult = await softDeletePayment(paymentId, quoteRequestId);
    if (!result.ok) {
      setUndoError(result.reason);
      return;
    }
    router.refresh();
  }

  if (sentQuotes.length === 0) {
    return <p className="text-[13px] text-fg-muted">Send a finalized quote before recording a payment.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {undoError ? <p className="text-[13px] font-medium text-bad">{undoError}</p> : null}
      {entries.length > 0 ? (
        <div className="rounded-xl border border-line bg-card px-3 shadow-e1">
          {entries.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-[14px] last:border-b-0">
              <span className="text-fg-muted">
                <DateTimeCST value={p.receivedAt} mode="date" /> · {p.method.replace(/_/g, " ")} · {p.status}
                {p.reference ? ` · ref ${p.reference}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <Money value={p.amount} tone="none" />
                <button type="button" onClick={() => onUndo(p.id)} className="text-[12px] font-medium text-bad hover:underline">
                  Undo
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {adding ? (
        <form action={formAction} className="flex flex-col gap-2 rounded-md border border-line-strong bg-card p-3">
          <input type="hidden" name="quote_request_id" value={quoteRequestId} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Finalized quote
              <select name="finalized_quote_id" required className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none">
                {sentQuotes.map((f) => (
                  <option key={f.id} value={f.id}>
                    #{f.number} — {f.totalAmount != null ? `$${f.totalAmount.toLocaleString()}` : "no total"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Amount ($)
              <input name="amount" type="number" step="any" min="0.01" required className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Method
              <select name="method" required defaultValue="wire" className="h-9 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg focus:border-fg focus:outline-none">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
              Received
              <input name="received_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Reference (optional)
            <input name="reference" placeholder="Check #, wire conf…" className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          {state.error ? <p className="text-[13px] font-medium text-bad">{state.error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} className="w-fit">
          + Record payment
        </Button>
      )}
    </div>
  );
}
