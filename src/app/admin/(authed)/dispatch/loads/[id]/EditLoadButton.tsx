"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AddLoadModal, type LoadFormValues } from "../AddLoadModal";

/**
 * Full Edit for a load (top bar) → reopens the Add Load modal on this load's
 * current values and saves through updateLoad. Every add-time field is editable
 * here, including the TRIP — which is the reason this exists: a load created
 * before its trip did can only be attached to that trip from a form that offers
 * the trip picker.
 *
 * Distinct from the small Edit inside Load details, which stays scoped to the
 * schedule fields that don't move the money.
 */
export function EditLoadButton({
  load,
  brokerNames,
  activeTrips,
}: {
  load: LoadFormValues;
  brokerNames: ReadonlyArray<string>;
  activeTrips: ReadonlyArray<string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="edit"
        size="sm"
        onClick={() => setOpen(true)}
        title="Edit load"
        leftIcon={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        }
      >
        Edit
      </Button>
      {open ? (
        <AddLoadModal
          onClose={() => setOpen(false)}
          brokerNames={brokerNames}
          activeTrips={activeTrips}
          load={load}
        />
      ) : null}
    </>
  );
}
