"use client";

import { useState } from "react";
import { updateLoadStatus } from "../actions";

/**
 * Load status changer with the odometer prompt. Advancing to Assigned,
 * Loaded, or Delivered opens a reading input (those define deadhead and
 * loaded miles); Pending / Cancelled submit straight through.
 *
 * Styled to match the load page's light inner cards.
 */

const STAGES: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Rolling to pickup" },
  { value: "loaded", label: "Loaded" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const NEEDS_ODO = new Set(["assigned", "loaded", "delivered"]);
const ODO_LABEL: Record<string, string> = {
  assigned: "Odometer when you started rolling",
  loaded: "Odometer when fully loaded",
  delivered: "Odometer at delivery",
};

export function LoadStatusControl({
  loadId,
  current,
  lastReading,
}: {
  loadId: string;
  current: string;
  lastReading: number | null;
}) {
  const [target, setTarget] = useState(current);
  const showOdo = NEEDS_ODO.has(target);

  return (
    <form action={updateLoadStatus.bind(null, loadId)} className="space-y-2 pt-0.5">
      <div className="flex items-center gap-2">
        <select
          name="status"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-fg focus:border-fg focus:outline-none"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-red-700 bg-red-600 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-red-700"
        >
          Update
        </button>
      </div>

      {showOdo ? (
        <div>
          <label className="block font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-subtle">
            {ODO_LABEL[target]}
          </label>
          <input
            name="odometer"
            type="number"
            inputMode="numeric"
            placeholder={
              lastReading != null
                ? lastReading.toLocaleString()
                : "Odometer reading"
            }
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 font-mono text-[14px] text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none"
          />
          {lastReading != null ? (
            <p className="mt-1 font-mono text-[10px] text-fg-subtle">
              Last reading {lastReading.toLocaleString()} · must be higher
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
