"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactMood } from "../actions";
import { MOOD_VALUES, MOOD_LABEL, MOOD_TONE, normalizeMood, type ContactMood } from "../../_shell/mood";

/**
 * The inline mood-pill selector — same interaction shape as RoleControl.tsx
 * (tap a pill, saves instantly via setContactMood, tapping the selected pill
 * again clears it), rendered once on the contact's own detail page
 * (contacts/[contactId]/page.tsx) — the single place mood is EDITED. Every
 * other surface that shows a contact (ContactHeader, ContactListCard,
 * ContactsMasterDetail) renders the read-only MoodBadge instead, matching
 * how RoleControl/ROLE_TONE are split. Unlike RoleControl's uniform-color
 * picker, each mood keeps its own semantic color here — Brent's explicit
 * call for this field, not a "no per-value colors" carryover from the role
 * picker's own 2026-08-09 restyle.
 */
export function MoodControl({
  contactId,
  accountId,
  current,
}: {
  contactId: string;
  accountId: string | null;
  current: string | null;
}) {
  const [mood, setMood] = useState<ContactMood | null>(normalizeMood(current));
  const [pending, startTransition] = useTransition();
  const [busyMood, setBusyMood] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function select(m: ContactMood) {
    if (pending) return;
    const prev = mood;
    const next = mood === m ? null : m;
    setBusyMood(m);
    setError(null);
    setMood(next);
    startTransition(async () => {
      const res = await setContactMood(contactId, accountId, next);
      setBusyMood(null);
      if (res.ok) {
        router.refresh();
      } else {
        setMood(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {MOOD_VALUES.map((m) => {
          const selected = mood === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => select(m)}
              className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                selected ? MOOD_TONE[m] : "border border-line-strong bg-card text-fg-muted hover:bg-inset"
              }`}
            >
              {busyMood === m ? "…" : MOOD_LABEL[m]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-bad">{error}</p>}
    </div>
  );
}
