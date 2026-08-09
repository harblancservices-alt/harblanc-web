"use client";

import { useState } from "react";
import { LABEL, CONTROL } from "./form";
import { IconX } from "./icons";

/**
 * Toggleable chip picker over a fixed option list, plus a free-type "Other"
 * entry for anything not on the list — used by the Details tab's Freight
 * profile group (equipment needed, special requirements). Uncontrolled at
 * the <form> level like PhonesEditor/LinksEditor: state lives here, and a
 * hidden JSON-array input carries the selection on submit.
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
  const [customText, setCustomText] = useState("");

  function toggle(opt: string) {
    setSelected((prev) => (prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt]));
  }
  function addCustom() {
    const v = customText.trim();
    if (!v || selected.includes(v)) return;
    setSelected((prev) => [...prev, v]);
    setCustomText("");
  }
  function remove(v: string) {
    setSelected((prev) => prev.filter((x) => x !== v));
  }

  const extras = selected.filter((v) => !options.includes(v));

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              aria-pressed={active}
              className={`px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                active
                  ? "border border-accent bg-accent text-white"
                  : "border border-fg-subtle bg-card text-fg-muted hover:bg-inset"
              }`}
            >
              {opt}
            </button>
          );
        })}
        {extras.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 border border-accent bg-accent px-2.5 py-1.5 text-[12.5px] font-semibold text-white"
          >
            {v}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`}>
              <IconX width={12} height={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Other (type and press Enter)"
          className={`h-9 w-full min-w-0 ${CONTROL}`}
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(selected)} />
    </div>
  );
}
