"use client";

import { useState } from "react";
import { CONTROL } from "./form";
import { PHONE_LABEL_PRESETS } from "./contactFields";

const OTHER = "__other__";

/**
 * The phone-label input used everywhere a phone label is entered (PhonesEditor
 * rows, the Stray numbers assign/create flow) — a picklist of PHONE_LABEL_PRESETS
 * with a free-type fallback. Picking "Other…" swaps the select for a text
 * input; a label that doesn't match any preset (legacy free-typed values)
 * starts in text mode so it isn't silently blanked out.
 */
export function PhoneLabelPicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const matchesPreset = (PHONE_LABEL_PRESETS as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(value !== "" && !matchesPreset);

  if (customMode) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Custom label"
          className={`h-11 w-full ${CONTROL}`}
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
          className="shrink-0 text-[11px] font-semibold text-fg-subtle hover:text-fg"
        >
          Presets
        </button>
      </div>
    );
  }

  return (
    <select
      value={matchesPreset ? value : ""}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setCustomMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      className={`h-11 w-full ${CONTROL} ${className}`}
    >
      <option value="" disabled>
        Select label…
      </option>
      {PHONE_LABEL_PRESETS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}
