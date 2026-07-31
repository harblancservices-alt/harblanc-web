"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { claimAiLead } from "./ai-agent/actions";

export type NewLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  commodities: string | null;
};

/**
 * One unclaimed released AI lead on the dashboard's "New leads to claim"
 * queue — same claimAiLead action the /crm/ai-agent register uses, so a rep
 * never has to leave the dashboard to seat a fresh lead.
 */
export function NewLeadRow({ lead }: { lead: NewLead }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function claim() {
    setError(null);
    startTransition(async () => {
      const res = await claimAiLead(lead.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const location = [lead.city, lead.state].filter(Boolean).join(", ");

  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3.5">
      <Link href={`/crm/accounts/${lead.id}`} prefetch={false} className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-fg">{lead.name}</p>
        <p className="mt-0.5 truncate text-[12px] text-fg-subtle">
          {[location, lead.commodities].filter(Boolean).join(" · ") || "—"}
        </p>
      </Link>
      <div className="shrink-0 text-right">
        <button
          type="button"
          onClick={claim}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Claiming…" : "Claim"}
        </button>
        {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
      </div>
    </li>
  );
}
