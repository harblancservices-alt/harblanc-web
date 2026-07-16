"use client";

import { useState, type ReactNode } from "react";
import { AddLoadModal } from "./AddLoadModal";
import { Button } from "@/components/ui/Button";

/**
 * The single "Add load" trigger used across the admin — the Load Board
 * header and the Dashboard "Active loads" empty state both render this, so
 * the button opens the exact same modal/flow and runs the same createLoad
 * server action. `className`/`children` let each call site style the trigger
 * without forking the behavior.
 *
 * It's the top-level CTA on both of its pages, hence primary-raised (the
 * More-sheet send-tile treatment) rather than the flat primary.
 */

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
      <Button
        type="button"
        variant="primary-raised"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children ?? "+ Add load"}
      </Button>
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
