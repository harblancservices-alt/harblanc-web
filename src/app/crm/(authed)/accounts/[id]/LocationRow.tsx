"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_EDIT, BTN_DANGER } from "../../_shell/ui";
import { LocationDialog, type LocationDefaults } from "./LocationDialog";
import { deleteLocation } from "./locations-actions";

export function LocationRow({ accountId, location }: { accountId: string; location: Required<LocationDefaults> }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const cityState = [location.city, location.state].filter(Boolean).join(", ");
  const fullAddress = [location.address, cityState, location.zip].filter(Boolean).join(", ");

  function onDelete() {
    if (!window.confirm(`Remove ${location.label || "this location"}?`)) return;
    startTransition(async () => {
      await deleteLocation(location.id, accountId);
      router.refresh();
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-fg">{location.label || "Location"}</p>
          {fullAddress && <p className="mt-0.5 text-[12.5px] text-fg-muted">{fullAddress}</p>}
          {location.receiving_hours && (
            <p className="mt-1 text-[12.5px] text-fg-muted">
              <span className="font-semibold text-fg-subtle">Receiving:</span> {location.receiving_hours}
            </p>
          )}
          {location.dock_notes && (
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-fg-muted">{location.dock_notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <LocationDialog
            accountId={accountId}
            mode="edit"
            defaults={location}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Edit
              </button>
            )}
          />
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_DANGER}`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
