"use client";

import { useState, useTransition } from "react";
import { Modal } from "../../_shell/Modal";
import { BTN_EDIT } from "../../_shell/ui";
import { listAccountLocations } from "../actions";
import type { CrmAccountLocation } from "../types";

/**
 * "Choose a saved location" — opens the customer's crm_account_locations
 * roster (fetched on open, not eagerly, since it's only needed once the
 * admin actually wants to pick one) as a full-screen-feeling sheet on
 * mobile / centered dialog on desktop (Modal already handles that split).
 * Picking a row hands the full location back to the caller, which applies
 * its snapshot fields AND the location id in one shipment update — this
 * component doesn't touch the shipment itself.
 */
export function LocationPickerModal({
  accountId,
  customerName,
  label,
  onSelect,
}: {
  accountId: string;
  customerName: string;
  label: string;
  onSelect: (location: CrmAccountLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<CrmAccountLocation[] | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setOpen(true);
    startTransition(async () => {
      const result = await listAccountLocations(accountId);
      setLocations(result);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
      >
        {label}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`${customerName || "Customer"}'s locations`}>
        {pending && !locations && <p className="py-4 text-[13px] text-fg-subtle">Loading locations…</p>}
        {locations && locations.length === 0 && (
          <p className="py-4 text-[13px] text-fg-subtle">
            No saved locations for this customer yet — fill the fields manually below, then use &ldquo;Save as
            new location&rdquo; to add one.
          </p>
        )}
        {locations && locations.length > 0 && (
          <ul className="flex flex-col divide-y divide-line">
            {locations.map((loc) => (
              <li key={loc.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(loc);
                    setOpen(false);
                  }}
                  className="block w-full py-3 text-left transition-colors hover:bg-inset"
                >
                  <p className="text-[13.5px] font-semibold text-fg">{loc.label || "Unlabeled location"}</p>
                  <p className="text-[12.5px] text-fg-muted">
                    {[loc.address, [loc.city, loc.state].filter(Boolean).join(", "), loc.zip]
                      .filter(Boolean)
                      .join(" · ") || "No address on file"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
