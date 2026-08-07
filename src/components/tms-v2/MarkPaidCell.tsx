"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markLoadPaid } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";

/** Per-row "Mark paid" action for a DataList column (Receivables, Trip
 * Detail's linked loads, Broker Profile's load history — the AR-Paid
 * transition, wired everywhere the audit flagged it as missing). Stops the
 * click from bubbling into DataList's per-row/per-cell <Link> before firing
 * the mutation, so the row stays server-renderable and navigable elsewhere. */
export function MarkPaidCell({ loadId }: { loadId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setError(null);
    const result: MutationResult = await markLoadPaid(loadId);
    if (result.ok) {
      router.refresh();
    } else {
      setPending(false);
      setError(result.reason);
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="h-7 shrink-0 rounded-md border border-line-strong bg-card px-2.5 text-[12px] font-medium text-fg hover:bg-elevated disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark paid"}
      </button>
      {error ? <span className="max-w-[140px] text-right text-[11px] text-bad">{error}</span> : null}
    </div>
  );
}
