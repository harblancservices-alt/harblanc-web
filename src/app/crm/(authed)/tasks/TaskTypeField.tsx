"use client";

import { useState } from "react";
import { CONTROL, FieldLabel } from "../_shell/form";
import { TASK_TYPES, OTHER_TASK_TYPE } from "./taskType";

/**
 * The task-type input inside TaskDialog — a picklist of TASK_TYPES with a
 * free-type "Other…" fallback, same pattern as PhoneLabelPicker. Picking
 * "Other…" swaps the select for a text input; a value that doesn't match any
 * preset (a legacy or previously hand-typed type) starts in text mode so it
 * isn't silently blanked out. Both the select and the text input submit under
 * the same `name="task_type"`, so the surrounding form's FormData sees a
 * single value either way — no extra hidden field needed.
 */
export function TaskTypeField({ defaultValue }: { defaultValue?: string | null }) {
  const initial = defaultValue ?? "";
  const isPreset = (TASK_TYPES as readonly string[]).includes(initial);
  const [customMode, setCustomMode] = useState(initial !== "" && !isPreset);
  const [customSeed, setCustomSeed] = useState(customMode ? initial : "");

  if (customMode) {
    return (
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Type</FieldLabel>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            name="task_type"
            defaultValue={customSeed}
            placeholder="Custom type"
            className={`h-11 w-full ${CONTROL}`}
          />
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="shrink-0 text-[11px] font-semibold text-fg-subtle hover:text-fg"
          >
            Presets
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>Type</FieldLabel>
      <select
        name="task_type"
        defaultValue={isPreset ? initial : ""}
        onChange={(e) => {
          if (e.target.value === OTHER_TASK_TYPE) {
            setCustomSeed("");
            setCustomMode(true);
          }
        }}
        className={`h-11 ${CONTROL}`}
      >
        <option value="">No type</option>
        {TASK_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value={OTHER_TASK_TYPE}>Other…</option>
      </select>
    </label>
  );
}
