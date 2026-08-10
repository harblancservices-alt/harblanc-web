"use client";

import { useState } from "react";
import { CONTROL, CONTROL_SIZE, RemoveRowButton, RepeatingFieldList } from "./compactForm";

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

  return (
    <RepeatingFieldList
      label={label}
      name={name}
      rows={rows}
      onAdd={add}
      addLabel="Add lane"
      serialize={(rs) => JSON.stringify(rs.filter((r) => r.origin.trim() || r.destination.trim()))}
      renderRow={(row, i) => (
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
          <input
            type="text"
            value={row.origin}
            onChange={(e) => update(i, { origin: e.target.value })}
            placeholder="Origin (e.g. Dallas, TX)"
            className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
          />
          <span aria-hidden className="text-fg-subtle">
            →
          </span>
          <input
            type="text"
            value={row.destination}
            onChange={(e) => update(i, { destination: e.target.value })}
            placeholder="Destination (e.g. Atlanta, GA)"
            className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
          />
          <RemoveRowButton onClick={() => remove(i)} disabled={rows.length <= 1} label="Remove lane" />
        </div>
      )}
    />
  );
}
