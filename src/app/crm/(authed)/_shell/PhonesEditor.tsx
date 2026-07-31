"use client";

import { useState } from "react";
import { LABEL, CONTROL } from "./form";
import { IconPlus, IconX } from "./icons";
import { LabelPicker } from "./LabelPicker";
import { PHONE_LABEL_PRESETS, type PhoneEntry } from "./contactFields";
import { BTN_DANGER, BTN_EDIT } from "./ui";

/**
 * Editable list of labeled phone numbers (Main line, Dispatch, Bob cell…).
 * Uncontrolled at the <form> level like every other CRM field — state lives
 * here, and a hidden JSON input carries the cleaned array on submit so the
 * caller's plain `new FormData(form)` picks it up like any other field.
 */
export function PhonesEditor({
  name = "phones",
  label = "Phone numbers",
  defaultValue,
}: {
  name?: string;
  label?: string;
  defaultValue?: PhoneEntry[];
}) {
  const [rows, setRows] = useState<PhoneEntry[]>(
    defaultValue && defaultValue.length ? defaultValue : [{ label: "", number: "" }],
  );

  function update(i: number, patch: Partial<PhoneEntry>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((prev) => [...prev, { label: "", number: "" }]);
  }
  function remove(i: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const cleaned = rows.filter((r) => r.number.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.3fr_auto] items-center gap-2">
            <LabelPicker
              value={row.label}
              onChange={(next) => update(i, { label: next })}
              presets={PHONE_LABEL_PRESETS}
            />
            <input
              type="tel"
              inputMode="tel"
              value={row.number}
              onChange={(e) => update(i, { number: e.target.value })}
              placeholder="Phone number"
              className={`h-11 ${CONTROL}`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={rows.length <= 1}
              aria-label="Remove phone"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${BTN_DANGER}`}
            >
              <IconX width={16} height={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className={`inline-flex w-fit items-center gap-1.5 rounded-lg border-dashed px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
      >
        <IconPlus width={13} height={13} />
        Add phone
      </button>
      <input type="hidden" name={name} value={JSON.stringify(cleaned)} />
    </div>
  );
}
