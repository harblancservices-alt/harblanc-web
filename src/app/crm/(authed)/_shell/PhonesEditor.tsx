"use client";

import { useState } from "react";
import { CONTROL, CONTROL_SIZE, RemoveRowButton, RepeatingFieldList } from "./compactForm";
import { LabelPicker } from "./LabelPicker";
import { PHONE_LABEL_PRESETS, type PhoneEntry } from "./contactFields";
import { formatPhoneInput } from "@/lib/domain/phone";

/**
 * Editable list of labeled phone numbers (Main line, Dispatch, Bob cell…).
 * Uncontrolled at the <form> level like every other CRM field — state lives
 * here, and a hidden JSON input carries the cleaned array on submit so the
 * caller's plain `new FormData(form)` picks it up like any other field.
 * Every number is progressively formatted "(XXX) XXX-XXXX" as it's typed
 * (formatPhoneInput, the same helper tms-v2's PhoneField uses) — what's
 * shown while typing is exactly what gets stored, so display never needs a
 * separate re-format step for anything entered through this editor.
 */
export function PhonesEditor({
  name = "phones",
  label = "Phone numbers",
  defaultValue,
  /** Stacked, narrower-friendly row layout (label picker + remove on one
   * line, the number full-width below) for tight containers like the
   * profile's sidebar Company card — the default 3-column row only fits a
   * modal-width form. */
  compact = false,
}: {
  name?: string;
  label?: string;
  defaultValue?: PhoneEntry[];
  compact?: boolean;
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

  return (
    <RepeatingFieldList
      label={label}
      name={name}
      rows={rows}
      onAdd={add}
      addLabel="Add phone"
      serialize={(rs) => JSON.stringify(rs.filter((r) => r.number.trim().length > 0))}
      renderRow={(row, i) =>
        compact ? (
          <div className="flex flex-col gap-1.5 rounded-[5px] border border-line-strong bg-inset p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <LabelPicker
                  value={row.label}
                  onChange={(next) => update(i, { label: next })}
                  presets={PHONE_LABEL_PRESETS}
                />
              </div>
              <RemoveRowButton onClick={() => remove(i)} disabled={rows.length <= 1} label="Remove phone" />
            </div>
            <input
              type="tel"
              inputMode="tel"
              value={row.number}
              onChange={(e) => update(i, { number: formatPhoneInput(e.target.value) })}
              placeholder="(555) 555-1234"
              className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1.3fr_auto] items-center gap-2">
            <div className="min-w-0">
              <LabelPicker
                value={row.label}
                onChange={(next) => update(i, { label: next })}
                presets={PHONE_LABEL_PRESETS}
              />
            </div>
            <input
              type="tel"
              inputMode="tel"
              value={row.number}
              onChange={(e) => update(i, { number: formatPhoneInput(e.target.value) })}
              placeholder="(555) 555-1234"
              className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
            />
            <RemoveRowButton onClick={() => remove(i)} disabled={rows.length <= 1} label="Remove phone" />
          </div>
        )
      }
    />
  );
}
