"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_PRIMARY, BTN_SUCCESS } from "../../../_shell/ui";
import { resolveAndProspectCompany, addToProspects, markProcessed, type CompanySide, type BolStatus } from "../actions";

export type PartySummary = {
  side: CompanySide;
  hasName: boolean;
  matchedAccount: { id: string; lifecycleStatus: string } | null;
};

/**
 * Sticky bottom dock — the page's two real completion actions, always in
 * reach while scrolling the entity queue. "Send to Prospects" bulk-runs the
 * same per-party pipeline the Company rows use individually (an already-
 * resolved-but-not-yet-prospect account gets addToProspects; an unresolved
 * one goes through the full resolveAndProspectCompany search→link/create→
 * prospect flow), so a BOL with confident matches on every side can be
 * finished in one click from here without opening a single row. "Mark
 * Processed" is the existing StatusBar action, reused as-is.
 *
 * "Assign to rep" is NOT here — crm_bol_entries has no column to persist an
 * assignee on the BOL itself (only requested_by_user_id / processed_by_
 * user_id exist, neither of which mean "assigned rep"), and adding one is a
 * schema change, which this pass explicitly excludes. Flagged for a
 * follow-up decision rather than invented.
 */
export function ActionDock({ bolId, status, parties }: { bolId: string; status: BolStatus; parties: PartySummary[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pendingParties = parties.filter((p) => p.hasName && (!p.matchedAccount || p.matchedAccount.lifecycleStatus !== "prospect"));

  function sendToProspects() {
    setError(null);
    startTransition(async () => {
      for (const p of pendingParties) {
        const res = p.matchedAccount ? await addToProspects(p.matchedAccount.id) : await resolveAndProspectCompany(bolId, p.side);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      router.refresh();
    });
  }

  function onMarkProcessed() {
    setError(null);
    startTransition(async () => {
      const res = await markProcessed(bolId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong bg-card px-4 py-3 shadow-e3">
      <div className="min-w-0">
        {error ? (
          <p className="text-[12.5px] text-bad">{error}</p>
        ) : (
          <p className="text-[12px] text-fg-muted">
            {pendingParties.length > 0
              ? `${pendingParties.length} part${pendingParties.length === 1 ? "y" : "ies"} not yet in Prospects.`
              : "Every extracted company is already in Prospects."}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={pending || status === "processed"}
          onClick={onMarkProcessed}
          className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
        >
          {status === "processed" ? "Processed" : "Mark Processed"}
        </button>
        <button
          type="button"
          disabled={pending || pendingParties.length === 0}
          onClick={sendToProspects}
          className={`inline-flex h-9 items-center rounded-md px-4 text-[13px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
        >
          {pending ? "Sending…" : "Send to Prospects"}
        </button>
      </div>
    </div>
  );
}
