"use client";

import { useState, type ReactNode } from "react";
import { AddLoadModal } from "./AddLoadModal";

/**
 * The single "Add load" trigger used across the admin — the Load Board
 * header and the Dashboard "Active loads" empty state both render this, so
 * the button opens the exact same modal/flow and runs the same createLoad
 * server action. `className`/`children` let each call site style the trigger
 * without forking the behavior.
 */
const DEFAULT_BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-red-700 bg-red-600 px-3.5 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-red-700";

export function AddLoadButton({
  brokerNames,
  activeTrips,
  className,
  children,
}: {
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? DEFAULT_BTN}
      >
        {children ?? "+ Add load"}
      </button>
      {open ? (
        <AddLoadModal
          onClose={() => setOpen(false)}
          brokerNames={brokerNames}
          activeTrips={activeTrips}
        />
      ) : null}
    </>
  );
}
