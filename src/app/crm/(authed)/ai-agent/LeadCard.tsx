"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { claimAiLead } from "./actions";

export type AiAgentLead = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  commodities: string | null;
  contactCount: number;
  assigneeName: string | null;
};

/**
 * One released AI lead on the team register. The card body is a "stretched
 * link" to the company profile (same technique as pipeline/DealCard.tsx) so
 * the whole card opens /crm/accounts/[id]; the Claim button sits in its own
 * stacking layer above the link so it keeps working as its own control.
 */
export function LeadCard({ lead }: { lead: AiAgentLead }) {
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
    <div className="relative rounded-2xl border border-line-strong bg-card p-4 shadow-e2 transition-shadow hover:shadow-e3">
      <Link
        href={`/crm/accounts/${lead.id}`}
        prefetch={false}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={`Open ${lead.name}`}
      />
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[14.5px] font-semibold text-fg">
            {lead.name}
          </p>
          {!lead.assigneeName && (
            <span className="shrink-0 rounded-full bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
              New
            </span>
          )}
        </div>
        {location && <p className="mt-0.5 text-[12.5px] text-fg-muted">{location}</p>}

        <dl className="mt-2.5 space-y-1 text-[12.5px] text-fg-muted">
          {lead.commodities && (
            <p className="truncate">
              <span className="text-fg-subtle">Hauls:</span> {lead.commodities}
            </p>
          )}
          <p>
            {lead.contactCount} {lead.contactCount === 1 ? "contact" : "contacts"}
          </p>
        </dl>
      </div>

      <div className="relative z-10 mt-3">
        {lead.assigneeName ? (
          <p className="text-[12px] font-semibold text-fg-subtle">
            Working: <span className="text-fg">{lead.assigneeName}</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={claim}
            disabled={pending}
            className="pointer-events-auto inline-flex h-8 items-center rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Claiming…" : "Claim / I'll work this"}
          </button>
        )}
        {error && <p className="mt-1 text-[12px] text-bad">{error}</p>}
      </div>
    </div>
  );
}
