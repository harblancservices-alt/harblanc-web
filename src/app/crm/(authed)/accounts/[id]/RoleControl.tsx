"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactRole } from "../actions";
import { ROLE_CATEGORIES, ROLE_LABEL, normalizeRoleCategory, type CrmPersonRoleCategory } from "./roles";

/**
 * The inline role-pill selector — every surface that shows a contact
 * (its own profile page, the Contacts tab rows, the Overview People cards)
 * renders this SAME component so a rep sets someone's role by tapping a
 * pill right there, instantly, saving through setContactRole. Role-setting
 * deliberately does NOT live in the add/edit contact dialog anymore — this
 * is the one and only way to set it. Clicking the already-selected pill
 * clears the role (toggle off), matching the picker this replaced inside
 * ContactDialog.
 *
 * 2026-08-09 restyle: was a faint gray-on-white pill row (the CRM's
 * no-faint-grey rule flagged it) with per-role tones on select. Now a
 * uniform pill treatment — selected = solid green, unselected = a readable
 * outline (border-fg-subtle/text-fg, never the washed-out fg-muted-on-inset
 * combo) — matching the Freight profile and Tags pill pickers. A legacy
 * "manager_owner" value (the combined role this split from) normalizes to
 * "manager" on open via normalizeRoleCategory so it still shows selected,
 * not blank.
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
  const [role, setRole] = useState<CrmPersonRoleCategory | null>(normalizeRoleCategory(current));
  const [pending, startTransition] = useTransition();
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function select(r: CrmPersonRoleCategory) {
    if (pending) return;
    const prev = role;
    const next = role === r ? null : r;
    setBusyRole(r);
    setError(null);
    setRole(next);
    startTransition(async () => {
      const res = await setContactRole(contactId, accountId, next);
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
      <div className="flex flex-wrap gap-2">
        {ROLE_CATEGORIES.map((r) => {
          const selected = role === r;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => select(r)}
              className={`flex min-h-11 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                selected
                  ? "border border-ok bg-ok text-white hover:bg-ok/90"
                  : "border border-fg-subtle bg-card text-fg hover:bg-inset"
              }`}
            >
              {busyRole === r ? "…" : ROLE_LABEL[r]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-bad">{error}</p>}
    </div>
  );
}
