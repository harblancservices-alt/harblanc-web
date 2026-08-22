"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveAndProspectCompany, addToProspects, markProcessed, type CompanySide, type BolStatus } from "../actions";
import { normalizeStage, stageRank } from "../../../accounts/lifecycle";
import { DEPTH_PRIMARY, DEPTH_SUCCESS } from "./buttonDepth";

export type PartySummary = {
  side: CompanySide;
  hasName: boolean;
  matchedAccount: { id: string; lifecycleStatus: string } | null;
};

/** The carrier override, when it's already linked (crm_bol_entries.
 * matched_carrier_account_id) — the dock only ever promotes an ALREADY-
 * overridden carrier (never triggers the override itself; that stays an
 * explicit human decision on CarrierRow). null when never overridden. */
export type CarrierSummary = { matchedAccountId: string; lifecycleStatus: string } | null;

/** True when a party/carrier is worth promoting: named but either
 * unresolved (nothing linked yet — resolveAndProspectCompany will link/
 * create it fresh at Prospect) or resolved at a stage that genuinely ranks
 * below Prospect. Mirrors the no-downgrade guardrail so the dock's "N not
 * yet in Prospects" count and button never claim work is pending for a
 * company that's already at or beyond Prospect (e.g. an Active Customer). */
function isPending(hasName: boolean, matchedAccount: { lifecycleStatus: string } | null): boolean {
  if (!hasName) return false;
  if (!matchedAccount) return true;
  return stageRank(normalizeStage(matchedAccount.lifecycleStatus)) < stageRank("prospect");
}

/**
 * Sticky bottom dock — the page's two real completion actions, always in
 * reach while scrolling the entity queue. "Send to Prospects" bulk-promotes
 * every resolved party (shipper/consignee/bill_to, plus the carrier if it
 * was already overridden) through the same promote-with-guardrail pipeline
 * the Company rows use individually, then always finishes by marking the
 * BOL processed — a BOL with confident matches on every side can be
 * finished in one click from here. Unresolved sides (no name ever
 * extracted, or extracted but not yet linked) are still promoted via
 * resolveAndProspectCompany's own search→link/create flow; a side with no
 * name at all is simply skipped (nothing to promote). "Mark Processed" is
 * the same status write, reused as-is.
 *
 * "Assign to rep" is NOT here — crm_bol_entries has no column to persist an
 * assignee on the BOL itself (only requested_by_user_id / processed_by_
 * user_id exist, neither of which mean "assigned rep"), and adding one is a
 * schema change, which this pass explicitly excludes. Flagged for a
 * follow-up decision rather than invented.
 */
export function ActionDock({
  bolId,
  status,
  parties,
  carrier,
}: {
  bolId: string;
  status: BolStatus;
  parties: PartySummary[];
  carrier: CarrierSummary;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pendingParties = parties.filter((p) => isPending(p.hasName, p.matchedAccount));
  const carrierPending = carrier ? isPending(true, { lifecycleStatus: carrier.lifecycleStatus }) : false;
  const totalPending = pendingParties.length + (carrierPending ? 1 : 0);

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
      if (carrier && carrierPending) {
        const res = await addToProspects(carrier.matchedAccountId);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      const processedRes = await markProcessed(bolId);
      if (!processedRes.ok) {
        setError(processedRes.error);
        return;
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
            {totalPending > 0
              ? `${totalPending} part${totalPending === 1 ? "y" : "ies"} not yet in Prospects.`
              : "Every extracted company is already in Prospects."}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={pending || status === "processed"}
          onClick={onMarkProcessed}
          className={`inline-flex h-9 items-center rounded-md px-3.5 text-[13px] font-bold transition-colors ${DEPTH_SUCCESS}`}
        >
          {status === "processed" ? "Processed" : "Mark Processed"}
        </button>
        <button
          type="button"
          disabled={pending || status === "processed"}
          onClick={sendToProspects}
          className={`inline-flex h-9 items-center rounded-md px-4 text-[13px] font-bold transition-colors ${DEPTH_PRIMARY}`}
        >
          {pending ? "Sending…" : "Send to Prospects"}
        </button>
      </div>
    </div>
  );
}
