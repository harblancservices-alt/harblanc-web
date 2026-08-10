"use client";

import { useState } from "react";
import { CONTROL, CONTROL_SIZE, RemoveRowButton, RepeatingFieldList } from "./compactForm";
import { LabelPicker } from "./LabelPicker";
import { LINK_LABEL_PRESETS, type LinkEntry } from "./contactFields";

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

  return (
    <RepeatingFieldList
      label={label}
      name={name}
      rows={rows}
      onAdd={add}
      addLabel="Add link"
      serialize={(rs) => JSON.stringify(rs.filter((r) => r.url.trim().length > 0))}
      renderRow={(row, i) =>
        compact ? (
          <div className="flex flex-col gap-1.5 rounded-[5px] border border-line-strong bg-inset p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <LabelPicker
                  value={row.label}
                  onChange={(next) => update(i, { label: next })}
                  presets={LINK_LABEL_PRESETS}
                />
              </div>
              <RemoveRowButton onClick={() => remove(i)} disabled={rows.length <= 1} label="Remove link" />
            </div>
            <input
              type="text"
              inputMode="url"
              value={row.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://…"
              className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1.6fr_auto] items-center gap-2">
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
              className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
            />
            <RemoveRowButton onClick={() => remove(i)} disabled={rows.length <= 1} label="Remove link" />
          </div>
        )
      }
    />
  );
}
