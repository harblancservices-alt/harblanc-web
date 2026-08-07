"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreLoad } from "@/actions/tms-v2/loads";
import type { ArchivedLoadRow } from "@/lib/data/loads";

/** Deleted loads' restore path — mirrors ArchivedBrokersSection (Phase 6
 * item 4: a genuinely new capability, no permanent-delete affordance). */
export function ArchivedLoadsSection({ loads }: { loads: ArchivedLoadRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (loads.length === 0) return null;

  async function onRestore(id: string) {
    setPendingId(id);
    await restoreLoad(id);
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Deleted loads ({loads.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {loads.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
              <span className="text-fg">
                {l.loadNumber ?? l.id.slice(0, 8)}
                {l.brokerName ? <span className="text-fg-muted"> · {l.brokerName}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => onRestore(l.id)}
                disabled={pendingId === l.id}
                className="font-medium text-accent hover:underline disabled:opacity-50"
              >
                {pendingId === l.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
