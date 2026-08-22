"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimAiLead } from "./ai-agent/actions";

/**
 * The CLAIM half of a Next Best Action row for an unclaimed New Lead
 * (CRM_URGENCY_AUDIT.md follow-up: "make the action pills stage-aware").
 * Calls the same claimAiLead() the Prospects tab's LeadCard uses — assigns
 * the caller, advances New Lead -> Researching, and fires that stage's entry
 * auto-task, all server-side in one call (see ai-agent/actions.ts). Only
 * `accountId` crosses the Server->Client boundary (NextBestActionSection is
 * a Server Component; this stays a plain, serializable prop, same rule
 * NbaTaskAction follows).
 */
export function NbaClaimAction({
  accountId,
  label,
  className,
}: {
  accountId: string;
  label: string;
  className: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function claim() {
    setError(null);
    startTransition(async () => {
      const res = await claimAiLead(accountId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={claim} disabled={pending} className={className}>
        {pending ? "…" : label}
      </button>
      {error && <span className="text-[10.5px] font-medium text-bad">{error}</span>}
    </span>
  );
}
