"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreTrip } from "@/actions/tms-v2/trips";
import type { ArchivedTripRow } from "@/lib/data/trips";

/** Deleted trips' restore path — mirrors ArchivedBrokersSection exactly
 * (Phase 6 item 4: a genuinely new capability, no permanent-delete
 * affordance, same as brokers). Loads that were on a restored trip stay
 * unlinked (trip_id was cleared at delete time) — see restoreTrip's
 * comment in src/actions/tms-v2/trips.ts. */
export function ArchivedTripsSection({ trips }: { trips: ArchivedTripRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (trips.length === 0) return null;

  async function onRestore(id: string) {
    setPendingId(id);
    await restoreTrip(id);
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="mt-2 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Deleted trips ({trips.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {trips.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
              <span className="text-fg">{t.name || t.id.slice(0, 8)}</span>
              <button
                type="button"
                onClick={() => onRestore(t.id)}
                disabled={pendingId === t.id}
                className="font-medium text-accent hover:underline disabled:opacity-50"
              >
                {pendingId === t.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
