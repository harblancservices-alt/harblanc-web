"use client";

import { useState } from "react";
import { LABEL, CONTROL } from "./form";
import { IconPlus, IconX } from "./icons";
import { LabelPicker } from "./LabelPicker";
import { LINK_LABEL_PRESETS, type LinkEntry } from "./contactFields";
import { BTN_DANGER, BTN_EDIT } from "./ui";

/**
 * Editable list of labeled links (LinkedIn, Website, Load board…) — the
 * generic replacement for the old single "LinkedIn URL" / "Website" field.
 * Same uncontrolled-form pattern as PhonesEditor: local state + a hidden
 * JSON input so a plain `new FormData(form)` submit picks it up.
 */
export function LinksEditor({
  name = "links",
  label = "Links",
  defaultValue,
  /** Stacked, narrower-friendly row layout — see PhonesEditor's `compact`. */
  compact = false,
}: {
  name?: string;
  label?: string;
  defaultValue?: LinkEntry[];
  compact?: boolean;
}) {
  const [rows, setRows] = useState<LinkEntry[]>(
    defaultValue && defaultValue.length ? defaultValue : [{ label: "", url: "" }],
  );

  function update(i: number, patch: Partial<LinkEntry>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((prev) => [...prev, { label: "", url: "" }]);
  }
  function remove(i: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const cleaned = rows.filter((r) => r.url.trim().length > 0);

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) =>
          compact ? (
            <div
              key={i}
              className="flex flex-col gap-1.5 rounded-md border border-line-strong bg-inset p-2"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <LabelPicker
                    value={row.label}
                    onChange={(next) => update(i, { label: next })}
                    presets={LINK_LABEL_PRESETS}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={rows.length <= 1}
                  aria-label="Remove link"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${BTN_DANGER}`}
                >
                  <IconX width={14} height={14} />
                </button>
              </div>
              <input
                type="text"
                inputMode="url"
                value={row.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://…"
                className={`h-11 w-full min-w-0 ${CONTROL}`}
              />
            </div>
          ) : (
            <div key={i} className="grid grid-cols-[1fr_1.6fr_auto] items-center gap-2">
              <div className="min-w-0">
                <LabelPicker
                  value={row.label}
                  onChange={(next) => update(i, { label: next })}
                  presets={LINK_LABEL_PRESETS}
                />
              </div>
              <input
                type="text"
                inputMode="url"
                value={row.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://…"
                className={`h-11 w-full min-w-0 ${CONTROL}`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={rows.length <= 1}
                aria-label="Remove link"
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
        Add link
      </button>
      <input type="hidden" name={name} value={JSON.stringify(cleaned)} />
    </div>
  );
}
