"use client";

import { useState } from "react";
import { LABEL, PILL, PILL_SIZE, PILL_ACTIVE, PILL_INACTIVE, PILL_DASHED } from "./compactForm";
import { IconPlus } from "./icons";

/**
 * Tappable pill multi-select — same tap-to-select/tap-again-to-deselect
 * interaction as the contact role pills (RoleControl.tsx), just multi- not
 * single-select and GREEN (bg-ok) instead of per-category tones, per Brent's
 * 2026-08-09 call for the Freight profile group's Equipment needed/Special
 * requirements fields (FreightProfileDialog.tsx, its only caller). A saved
 * value that isn't in `options` (an old free-typed entry) still renders as
 * its own selected pill rather than being silently dropped — it just has no
 * "unselected" state of its own, so tapping it off removes it outright
 * instead of leaving a dangling empty pill. New custom values come from the
 * "+ Add" pill, which swaps in a small text input (LabelPicker's Other…
 * pattern) rather than a permanently-visible prompt row.
 *
 * Still uncontrolled at the <form> level like PhonesEditor/LinksEditor:
 * state lives here, a hidden JSON-array input carries the selection on
 * submit — the target column (equipment_needed/special_requirements) is
 * untouched, this only changed the input widget.
 */
export function MultiSelectChips({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: readonly string[];
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue ?? []);
  const [adding, setAdding] = useState(false);
  const [customText, setCustomText] = useState("");

  function toggle(opt: string) {
    setSelected((prev) => (prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt]));
  }
  function addCustom() {
    const v = customText.trim();
    if (v && !selected.includes(v)) setSelected((prev) => [...prev, v]);
    setCustomText("");
    setAdding(false);
  }

  // Preset options first, then any currently-selected value that isn't a
  // preset (a legacy free-typed entry) — every pill, preset or custom, is
  // rendered through the same toggle().
  const extras = selected.filter((v) => !options.includes(v));
  const pills = [...options, ...extras];

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {pills.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              aria-pressed={active}
              className={`${PILL} ${PILL_SIZE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
            >
              {opt}
            </button>
          );
        })}

        {adding ? (
          <div className={`flex items-center gap-1.5 rounded-full border border-fg-subtle bg-card pl-3 pr-1.5 ${PILL_SIZE}`}>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                } else if (e.key === "Escape") {
                  setCustomText("");
                  setAdding(false);
                }
              }}
              autoFocus
              placeholder="Custom…"
              className="h-full w-28 min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-medium text-fg outline-none"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customText.trim()}
              className="flex h-full shrink-0 items-center rounded-full bg-accent px-2.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`${PILL} ${PILL_SIZE} gap-1 ${PILL_DASHED}`}
          >
            <IconPlus width={13} height={13} />
            Add
          </button>
        )}
      </div>
      <input type="hidden" name={name} value={JSON.stringify(selected)} />
    </div>
  );
}
