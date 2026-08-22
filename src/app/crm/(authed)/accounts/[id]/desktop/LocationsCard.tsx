"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMapPin, IconPlus } from "../../../_shell/icons";
import { LocationDialog } from "../LocationDialog";
import { deleteLocation } from "../locations-actions";
import type { LocationListItem } from "../LocationRow";
import { D_CARD, D_H3, D_LINK } from "./ui";

/**
 * DESKTOP-ONLY "Locations" card (design handoff §Main column) — the compact
 * half of the Locations / Stray-numbers pair, one row per facility: a pin
 * icon tile, the label, the composed address, and an Edit link.
 *
 * Same data and same writes as the mobile LocationsSection/LocationRow —
 * page.tsx hands it the rows it already fetched, and Add/Edit/Remove all go
 * through the existing LocationDialog + deleteLocation. Only the row's shape
 * changed; the extra detail lines the mobile row shows (receiving hours,
 * dock notes, site contact, usual carrier) live one tap away in the same
 * Edit dialog, keeping this card to the handoff's two-line row.
 *
 * The "Primary" pill marks the first facility by `sort_order` — the handoff
 * shows an "HQ" pill there, but crm_account_locations has no HQ/headquarters
 * flag, so this reads the ordering the data actually carries rather than
 * inventing a field.
 */
export function LocationsCard({
  accountId,
  locations,
}: {
  accountId: string;
  locations: LocationListItem[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove(loc: LocationListItem) {
    if (!window.confirm(`Remove ${loc.label || "this location"}?`)) return;
    startTransition(async () => {
      await deleteLocation(loc.id, accountId);
      router.refresh();
    });
  }

  return (
    <div className={`${D_CARD} p-4 px-[18px]`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className={D_H3}>
          Locations {locations.length > 0 && <span className="font-medium text-fg-muted">· {locations.length}</span>}
        </h3>
        <LocationDialog
          accountId={accountId}
          mode="create"
          trigger={(open) => (
            <button type="button" onClick={open} className={`${D_LINK} inline-flex items-center gap-1`}>
              <IconPlus width={11} height={11} />
              Add location
            </button>
          )}
        />
      </div>

      {locations.length === 0 ? (
        <p className="text-[12.5px] text-fg-muted">No facilities on file yet — add a warehouse, yard, or dock.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {locations.map((loc, i) => {
            const cityState = [loc.city, loc.state].filter(Boolean).join(", ");
            const fullAddress = [loc.address, cityState, loc.zip].filter(Boolean).join(", ");
            return (
              <div key={loc.id} className="flex items-start gap-2.5 rounded-lg border border-line p-3">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <IconMapPin width={14} height={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-fg">
                    {loc.label || "Location"}
                    {i === 0 && (
                      <span className="rounded-full bg-accent/10 px-1.5 py-px text-[10px] font-bold text-accent">
                        Primary
                      </span>
                    )}
                  </div>
                  {fullAddress && <div className="mt-0.5 text-[12px] text-fg-muted">{fullAddress}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <LocationDialog
                    accountId={accountId}
                    mode="edit"
                    defaults={loc}
                    trigger={(open) => (
                      <button type="button" onClick={open} className={D_LINK}>
                        Edit
                      </button>
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => remove(loc)}
                    disabled={pending}
                    className="text-[11.5px] font-bold text-bad transition-colors hover:underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
