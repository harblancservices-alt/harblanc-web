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
  /** "sm" for a compact toolbar slot (the desktop Load Board's toolbar
   * button) — every other caller keeps the default "md". */
  size?: "sm" | "md";
  /** True for the mobile full-width treatment (every existing showFab=false
   * caller). The desktop toolbar's compact button is also showFab=false
   * but must NOT stretch full-width, so this is its own flag rather than
   * being implied by showFab. Defaults to showFab's own default (true) so
   * existing callers that only ever set `showFab` keep their exact prior
   * layout without also passing this. */
  fullWidth?: boolean;
  /** Button label — defaults to the existing "Add load" every current
   * caller (both mobile Load Board buttons) already shows; only the new
   * desktop toolbar button overrides this to "+ Add load" per Brent's
   * mockup. Kept a prop rather than a hardcoded change so mobile's label
   * stays byte-for-byte what it was before this pass. */
  label?: string;
};

/** Loads page header trigger for LoadFormModal in Add mode — a header
 * Button on desktop, a thumb-zone Fab on mobile, same modal either way. */
export function AddLoadButton({ brokerNames, activeTripNames, showFab = true, variant = "primary", size = "md", fullWidth = !showFab, label = "Add load" }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className={showFab ? "hidden lg:block" : ""}>
        <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} className={fullWidth ? "w-full justify-center" : ""}>
          {label}
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
