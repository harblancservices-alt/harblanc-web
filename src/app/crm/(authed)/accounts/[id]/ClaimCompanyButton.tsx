"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignAccount } from "../actions";

/**
 * MOBILE-ONLY "Claim" button — an OLD-MODEL SURVIVOR.
 *
 * The claim model was retired on 2026-08-25: agents no longer pick work out
 * of a pool, an admin assigns it. The desktop profile replaced this with
 * AssignmentControl, but the phone header still renders it, so the two trees
 * currently disagree about the rule. Left in place deliberately — mobile is
 * deprioritised and this works today.
 *
 * Only the UNCLAIMED branch is interactive: it swaps a bare "Unassigned"
 * span for this one button. A company that already has an owner keeps a
 * static chip on mobile, because reassigning is admin work that belongs on
 * the desktop control or the edit form.
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
