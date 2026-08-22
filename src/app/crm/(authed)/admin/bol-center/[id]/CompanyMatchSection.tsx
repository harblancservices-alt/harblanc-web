"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHead, BTN_EDIT, BTN_SUCCESS } from "../../../_shell/ui";
import { titleCaseWords } from "../../../_shell/format";
import { resolveAndProspectCompany, type CompanySide } from "../actions";
import { TaskOfferButton } from "../../../tasks/TaskOfferButton";

/**
 * Shows the party the BOL already gave us — name + address, right there,
 * no click-to-reveal. One button does everything: search the real matcher,
 * link a confident existing company (never a duplicate) or create one
 * straight from these exact fields, and promote it to Prospects — all in
 * one click, no pre-filled form to review and confirm. Once resolved, this
 * collapses to the same "View Company" surface every other resolved BOL
 * party shows.
 */
export function CompanyMatchSection({
  bolId,
  side,
  queryName,
  queryAddress,
  matchedAccount,
}: {
  bolId: string;
  side: CompanySide;
  queryName: string;
  queryAddress: string | null;
  matchedAccount: { id: string; name: string; lifecycleStatus: string } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Once resolved, the matched company itself is gone by the time the page
  // refreshes (matchedAccount.lifecycleStatus flips to 'prospect', hiding
  // this section's own button) — hold the id/name locally so the follow-up
  // task offer has something to render even after that refresh.
  const [justProspected, setJustProspected] = useState<{ accountId: string; name: string } | null>(null);

  const label = side === "shipper" ? "Shipper" : side === "consignee" ? "Consignee" : "Bill To";

  function onAddToProspects() {
    setError(null);
    startTransition(async () => {
      const res = await resolveAndProspectCompany(bolId, side);
      if (res.ok) {
        setJustProspected({ accountId: res.accountId, name: titleCaseWords(queryName) });
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHead title={`${label} — Company`} />
      <div className="flex flex-col gap-3 p-4">
        {error && <p className="text-[12.5px] text-bad">{error}</p>}

        {!queryName.trim() ? (
          <p className="text-[13px] text-fg-muted">No {label.toLowerCase()} name was extracted from this BOL.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line-strong bg-inset px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-fg">{titleCaseWords(queryName)}</p>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">
                {matchedAccount ? `Lifecycle: ${matchedAccount.lifecycleStatus}` : queryAddress || "No address extracted"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {matchedAccount ? (
                <>
                  {matchedAccount.lifecycleStatus !== "prospect" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={onAddToProspects}
                      className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
                    >
                      {pending ? "…" : "Add to Prospects"}
                    </button>
                  )}
                  <Link href={`/crm/accounts/${matchedAccount.id}`} className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}>
                    View Company →
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={onAddToProspects}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
                >
                  {pending ? "Adding…" : "Add to Prospects"}
                </button>
              )}
            </div>
          </div>
        )}

        {justProspected && (
          <div className="flex items-center gap-2">
            <TaskOfferButton
              label="+ Add follow-up task"
              defaults={{
                title: `Follow up with ${justProspected.name}`,
                task_type: "Follow-up call",
                account_id: justProspected.accountId,
              }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
