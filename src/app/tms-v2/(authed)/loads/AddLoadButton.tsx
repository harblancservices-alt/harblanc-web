"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { LoadFormModal } from "./LoadFormModal";

type Props = {
  brokerNames: string[];
  activeTripNames: string[];
  /** false when this button is already one of several inline actions (e.g.
   * Today's Quick Add rail) — a page renders at most one primary-action Fab
   * at a time, or they'd stack on top of each other. Defaults to true for
   * this button's usual job as the Load Board's lone header action. */
  showFab?: boolean;
  /** "destructive" renders the red button the Dashboard's empty Active
   * Loads panel uses (matching legacy's red "+ Add Load"); every other
   * caller keeps the default accent primary. */
  variant?: "primary" | "destructive";
};

/** Loads page header trigger for LoadFormModal in Add mode — a header
 * Button on desktop, a thumb-zone Fab on mobile, same modal either way. */
export function AddLoadButton({ brokerNames, activeTripNames, showFab = true, variant = "primary" }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className={showFab ? "hidden lg:block" : ""}>
        <Button type="button" variant={variant} onClick={() => setOpen(true)} className={showFab ? "" : "w-full justify-center"}>
          Add load
        </Button>
      </div>
      {showFab ? <Fab label="Add load" onClick={() => setOpen(true)} /> : null}
      <LoadFormModal
        open={open}
        onClose={() => setOpen(false)}
        brokerNames={brokerNames}
        activeTripNames={activeTripNames}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
