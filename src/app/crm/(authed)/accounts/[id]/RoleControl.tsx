"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactRole } from "../actions";
import { ROLE_CATEGORIES, ROLE_LABEL, ROLE_TONE, type CrmPersonRoleCategory } from "./roles";

/**
 * The inline role-pill selector — every surface that shows a contact
 * (its own profile page, the Contacts tab rows, the Overview People cards)
 * renders this SAME component so a rep sets someone's role by tapping a
 * pill right there, instantly, saving through setContactRole. Role-setting
 * deliberately does NOT live in the add/edit contact dialog anymore — this
 * is the one and only way to set it. Clicking the already-selected pill
 * clears the role (toggle off), matching the picker this replaced inside
 * ContactDialog.
 */
export function RoleControl({
  contactId,
  accountId,
  current,
}: {
  contactId: string;
  accountId: string | null;
  current: string | null;
}) {
  const [role, setRole] = useState(current ?? "");
  const [pending, startTransition] = useTransition();
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function select(r: CrmPersonRoleCategory) {
    if (pending) return;
    const prev = role;
    const next = role === r ? "" : r;
    setBusyRole(r);
    setError(null);
    setRole(next);
    startTransition(async () => {
      const res = await setContactRole(contactId, accountId, next || null);
      setBusyRole(null);
      if (res.ok) {
        router.refresh();
      } else {
        setRole(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {ROLE_CATEGORIES.map((r) => {
          const selected = role === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => select(r)}
              className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-60 ${
                selected
                  ? `${ROLE_TONE[r]} ring-2 ring-offset-1 ring-current`
                  : "bg-inset text-fg-muted hover:bg-card hover:text-fg"
              }`}
            >
              {busyRole === r ? "…" : ROLE_LABEL[r]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-[11.5px] text-bad">{error}</p>}
    </div>
  );
}
