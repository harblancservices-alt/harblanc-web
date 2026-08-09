"use client";

import { useState } from "react";
import { LABEL, CONTROL } from "./form";
import { IconPlus, IconX } from "./icons";
import { BTN_DANGER, BTN_EDIT } from "./ui";

export type LaneEntry = { origin: string; destination: string };

/**
 * Repeatable origin → destination rows — the Details tab's Freight profile
 * "Typical lanes" field. Same uncontrolled-form / hidden-JSON-input shape as
 * PhonesEditor/LinksEditor.
 */
export function LanesEditor({
  name = "lanes",
  label = "Typical lanes",
  defaultValue,
}: {
  name?: string;
  label?: string;
  defaultValue?: LaneEntry[];
}) {
  const [rows, setRows] = useState<LaneEntry[]>(
    defaultValue && defaultValue.length ? defaultValue : [{ origin: "", destination: "" }],
  );

  function update(i: number, patch: Partial<LaneEntry>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((prev) => [...prev, { origin: "", destination: "" }]);
  }
  function remove(i: number) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const cleaned = rows.filter((r) => r.origin.trim() || r.destination.trim());

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <input
              type="text"
              value={row.origin}
              onChange={(e) => update(i, { origin: e.target.value })}
              placeholder="Origin (e.g. Dallas, TX)"
              className={`h-11 w-full min-w-0 ${CONTROL}`}
            />
            <span aria-hidden className="text-fg-subtle">
              →
            </span>
            <input
              type="text"
              value={row.destination}
              onChange={(e) => update(i, { destination: e.target.value })}
              placeholder="Destination (e.g. Atlanta, GA)"
              className={`h-11 w-full min-w-0 ${CONTROL}`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={rows.length <= 1}
              aria-label="Remove lane"
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
        Add lane
      </button>
      <input type="hidden" name={name} value={JSON.stringify(cleaned)} />
    </div>
  );
}
