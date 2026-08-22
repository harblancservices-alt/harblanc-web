"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignAccount } from "../actions";

/**
 * MOBILE-ONLY "Claim" button — the phone profile's counterpart to the
 * desktop AssignmentControl, and deliberately a fraction of it.
 *
 * The mobile header (CompanyHeader.tsx) is locked layout: identity +
 * navigation + rep-at-a-glance in two flex-wrap groups. So only the
 * UNCLAIMED branch of RepBadge becomes interactive — it swaps a bare
 * "Unassigned" span for this one button, which claims the company for the
 * caller. A company that already has an owner keeps the exact static chip it
 * has always had on mobile: reassigning/unassigning is admin work that
 * belongs on the desktop control (or the Edit dialog), not squeezed into
 * this row.
 *
 * Same server action, same rule — assignAccount() re-checks everything and
 * the crm_accounts_guard_assignment trigger re-checks it again at the DB.
 */
export function ClaimCompanyButton({
  accountId,
  currentUserId,
}: {
  accountId: string;
  currentUserId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function claim() {
    setError(null);
    startTransition(async () => {
      const res = await assignAccount(accountId, currentUserId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={claim}
        disabled={pending}
        className="inline-flex shrink-0 items-center rounded-lg bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Claiming…" : "Claim"}
      </button>
      {error && <span className="text-[11.5px] font-semibold text-bad">{error}</span>}
    </span>
  );
}
