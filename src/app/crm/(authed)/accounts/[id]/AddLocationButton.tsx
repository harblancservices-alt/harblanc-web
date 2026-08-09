"use client";

import { LocationDialog } from "./LocationDialog";
import { BTN_PRIMARY } from "../../_shell/ui";
import { IconPlus } from "../../_shell/icons";

/**
 * The Locations & docks section's "Add location" action — a thin client
 * wrapper around LocationDialog's render-prop trigger, same pattern as
 * AddPersonButton.tsx. LocationsSection (a Server Component) can only ever
 * hand this a plain accountId string; the render-prop closure has to be
 * built on the client side of the boundary.
 */
export function AddLocationButton({ accountId }: { accountId: string }) {
  return (
    <LocationDialog
      accountId={accountId}
      mode="create"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_PRIMARY}`}
        >
          <IconPlus width={14} height={14} />
          Add location
        </button>
      )}
    />
  );
}
