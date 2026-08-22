"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHead, BTN_EDIT, BTN_NEUTRAL } from "../../../_shell/ui";
import { prospectCarrier } from "../actions";

/**
 * The carrier printed on a BOL is who moved the freight, not a sales
 * target — so it gets its own group, off by default, with an explicit
 * override if this one's actually worth prospecting. No matched_*_account_id
 * slot exists for it on crm_bol_entries (unlike shipper/consignee/bill_to),
 * so once prospected there's no persisted link back to this BOL — the
 * "View Company" link below only survives for the current page session,
 * same limitation the shipper/consignee/bill_to rows had before their own
 * FK columns existed.
 */
export function CarrierRow({ bolId, carrier }: { bolId: string; carrier: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [prospected, setProspected] = useState<string | null>(null);

  function onOverride() {
    setError(null);
    startTransition(async () => {
      const res = await prospectCarrier(bolId);
      if (res.ok) {
        setProspected(res.accountId);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHead title="Not a Sales Target" hint="The carrier that moved this freight — excluded from prospecting by default" />
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        {carrier ? (
          <>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-fg">{carrier}</p>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Carrier</p>
            </div>
            {error && <p className="text-[12.5px] text-bad">{error}</p>}
            {prospected ? (
              <Link href={`/crm/accounts/${prospected}`} className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_EDIT}`}>
                View Company →
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={onOverride}
                className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_NEUTRAL}`}
              >
                {pending ? "…" : "Actually, treat as a prospect"}
              </button>
            )}
          </>
        ) : (
          <p className="text-[13px] text-fg-muted">No carrier was extracted from this BOL.</p>
        )}
      </div>
    </Card>
  );
}
