"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignAccount } from "../../../actions";
import type { RepOption } from "../../../CompanyDialog";

/**
 * The "reassign" link under OWNER in the dark header.
 *
 * A separate, deliberately tiny control rather than desktop/AssignmentControl.
 * That component is the right one on a light card — it draws an owner pill,
 * an initial disc, a Claim button and a dropdown — and every one of those
 * surfaces is styled for `bg-card`. Dropped onto this header it would put a
 * light pill on a navy ground, and the header already SAYS who the owner is
 * two lines up, so the pill would be saying it twice.
 *
 * So this renders what the design draws: one underlined word, which opens
 * one select. It calls the same `assignAccount` server action, which is
 * where the actual rule lives — an ordinary rep can only ever claim a
 * company for themselves, an admin can hand it to anybody, and that is
 * enforced in the action rather than by hiding a control.
 *
 * Unclaimed companies get "claim it" instead. Same write, honest verb.
 */
export function ReassignLink({
  accountId,
  ownerId,
  currentUserId,
  isAdmin,
  reps,
}: {
  accountId: string;
  ownerId: string | null;
  currentUserId: string;
  isAdmin: boolean;
  reps: RepOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(target: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await assignAccount(accountId, target);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  // A rep who does not own this company can only take it themselves; there
  // is no menu to show them.
  if (!isAdmin) {
    if (ownerId === currentUserId) return null;
    return (
      <button
        type="button"
        onClick={() => run(currentUserId)}
        disabled={pending}
        className="text-[11px] text-white/55 underline underline-offset-2 hover:text-white disabled:opacity-60"
      >
        {pending ? "claiming…" : "claim it"}
      </button>
    );
  }

  if (open) {
    return (
      <select
        autoFocus
        defaultValue={ownerId ?? ""}
        disabled={pending}
        onChange={(e) => run(e.target.value || null)}
        onBlur={() => setOpen(false)}
        className="max-w-[130px] rounded border border-white/25 bg-file-bar px-1.5 py-0.5 text-[11px] text-white outline-none"
      >
        <option value="">Nobody</option>
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      disabled={pending}
      title={error ?? undefined}
      className={`text-[11px] underline underline-offset-2 disabled:opacity-60 ${
        error ? "text-bad" : "text-white/55 hover:text-white"
      }`}
    >
      {error ? "failed — retry" : ownerId ? "reassign" : "assign"}
    </button>
  );
}
