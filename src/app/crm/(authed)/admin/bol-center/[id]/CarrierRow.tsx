"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { prospectCarrier } from "../actions";
import { SectionCard } from "./SectionCard";
import { DEPTH_EDIT, DEPTH_NEUTRAL } from "./buttonDepth";

/**
 * The carrier printed on a BOL is who moved the freight, not a sales
 * target — so it gets its own group, off by default, with an explicit
 * override if this one's actually worth prospecting. matchedAccount is
 * fetched fresh from crm_bol_entries.matched_carrier_account_id (2026-08-21
 * migration 20260821020000), so "View Company" survives a refresh, same as
 * the other three sides — the override itself (prospectCarrier) persists
 * that column and promotes the account subject to the same no-downgrade
 * guardrail every other side uses.
 */
export function CarrierRow({
  bolId,
  carrier,
  matchedAccount,
}: {
  bolId: string;
  carrier: string | null;
  matchedAccount: { id: string; name: string; lifecycleStatus: string } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [localAccountId, setLocalAccountId] = useState<string | null>(null);

  const resolvedId = matchedAccount?.id ?? localAccountId;

  function onOverride() {
    setError(null);
    startTransition(async () => {
      const res = await prospectCarrier(bolId);
      if (res.ok) {
        setLocalAccountId(res.accountId);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <SectionCard title="Not a Sales Target" hint="The carrier that moved this freight — excluded from prospecting by default">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {carrier ? (
          <>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-fg">{carrier}</p>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Carrier</p>
            </div>
            {error && <p className="text-[12.5px] text-bad">{error}</p>}
            {resolvedId ? (
              <Link href={`/crm/accounts/${resolvedId}`} className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${DEPTH_EDIT}`}>
                View Company →
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={onOverride}
                className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${DEPTH_NEUTRAL}`}
              >
                {pending ? "…" : "Actually, treat as a prospect"}
              </button>
            )}
          </>
        ) : (
          <p className="text-[13px] text-fg-muted">No carrier was extracted from this BOL.</p>
        )}
      </div>
    </SectionCard>
  );
}
