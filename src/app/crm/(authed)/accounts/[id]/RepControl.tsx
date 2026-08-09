"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignRep } from "../actions";
import type { RepOption } from "../CompanyDialog";

/**
 * Assign / change the rep on a company. A compact select that writes on change
 * (assignRep logs the reassignment to the timeline). Empty = Unassigned.
 */
export function RepControl({
  accountId,
  current,
  reps,
}: {
  accountId: string;
  current: string | null;
  reps: RepOption[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const prev = value;
    const next = e.target.value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const res = await assignRep(accountId, next);
      if (res.ok) router.refresh();
      else {
        setValue(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        aria-label="Assigned rep"
        className="h-9 border border-fg-subtle bg-card px-2.5 text-[13px] font-medium text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {reps.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
