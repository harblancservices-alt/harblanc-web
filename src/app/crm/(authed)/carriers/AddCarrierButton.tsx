"use client";

import { CarrierFormDialog } from "./CarrierFormDialog";
import { IconPlus } from "../_shell/icons";
import { BTN_PRIMARY } from "../_shell/ui";

/** "Add carrier" — the primary create action on the carrier directory. Thin
 * client wrapper over CarrierFormDialog so the trigger render-prop is never
 * rendered directly from a Server Component (see the CRM RSC trigger-
 * boundary rule — a *Dialog's trigger prop must always come from a Client
 * Component, not a page.tsx). */
export function AddCarrierButton() {
  return (
    <CarrierFormDialog
      mode="create"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-bold shadow-e2 transition-all hover:-translate-y-0.5 hover:shadow-e3 ${BTN_PRIMARY}`}
        >
          <IconPlus width={16} height={16} />
          Add carrier
        </button>
      )}
    />
  );
}
