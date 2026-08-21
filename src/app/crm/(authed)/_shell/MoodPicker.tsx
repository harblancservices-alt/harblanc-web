"use client";

import { useState } from "react";
import { MOOD_VALUES, MOOD_LABEL, MOOD_TONE, normalizeMood, type ContactMood } from "./mood";
import { LABEL } from "./compactForm";

/**
 * Single-select mood chip row for the Add/Edit Contact forms — a plain form
 * field (hidden input + buttons), not an instant-save control. Clicking the
 * already-selected chip clears it (same toggle-off behavior as RoleControl).
 * The inline, instant-save version used on the contact's own display lives
 * separately as accounts/[id]/MoodControl.tsx.
 */
export function MoodPicker({ name = "current_mood", defaultValue }: { name?: string; defaultValue?: string | null }) {
  const [mood, setMood] = useState<ContactMood | null>(normalizeMood(defaultValue));

  return (
    <label className="flex w-full min-w-0 flex-col gap-1.5">
      <span className={LABEL}>Current mood</span>
      <input type="hidden" name={name} value={mood ?? ""} />
      <div className="flex flex-wrap gap-1.5">
        {MOOD_VALUES.map((v) => {
          const selected = mood === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={selected}
              onClick={() => setMood(mood === v ? null : v)}
              className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold transition-colors ${
                selected ? MOOD_TONE[v] : "border border-line-strong bg-card text-fg-muted hover:bg-inset"
              }`}
            >
              {MOOD_LABEL[v]}
            </button>
          );
        })}
      </div>
    </label>
  );
}
