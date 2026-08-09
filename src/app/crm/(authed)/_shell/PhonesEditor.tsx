"use client";

import { useState } from "react";
import { LABEL, CONTROL } from "./form";
import { IconPlus, IconX } from "./icons";
import { LabelPicker } from "./LabelPicker";
import { PHONE_LABEL_PRESETS, type PhoneEntry } from "./contactFields";
import { BTN_DANGER, BTN_EDIT } from "./ui";
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

  const cleaned = rows.filter((r) => r.number.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) =>
          compact ? (
            <div
              key={i}
              className="flex flex-col gap-1.5 border border-line-strong bg-inset p-2"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <LabelPicker
                    value={row.label}
                    onChange={(next) => update(i, { label: next })}
                    presets={PHONE_LABEL_PRESETS}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={rows.length <= 1}
                  aria-label="Remove phone"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${BTN_DANGER}`}
                >
                  <IconX width={14} height={14} />
                </button>
              </div>
              <input
                type="tel"
                inputMode="tel"
                value={row.number}
                onChange={(e) => update(i, { number: formatPhoneInput(e.target.value) })}
                placeholder="(555) 555-1234"
                className={`h-11 w-full min-w-0 ${CONTROL}`}
              />
            </div>
          ) : (
            <div key={i} className="grid grid-cols-[1fr_1.3fr_auto] items-center gap-2">
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
                className={`h-11 w-full min-w-0 ${CONTROL}`}
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
          ),
        )}
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
