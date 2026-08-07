"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreBroker } from "@/actions/tms-v2/brokers";
import type { ArchivedBrokerRow } from "@/lib/data/broker-directory";

/** Collapsed-by-default archived-broker list with a Restore action — the
 * reversible half of archive, and a genuinely new capability (audit trap
 * #7: no restore path existed anywhere in the repo for any entity). */
export function ArchivedBrokersSection({ brokers }: { brokers: ArchivedBrokerRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (brokers.length === 0) return null;

  async function onRestore(id: string) {
    setPendingId(id);
    await restoreBroker(id);
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Archived brokers ({brokers.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {brokers.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
              <span className="text-fg">{b.name}</span>
              <button
                type="button"
                onClick={() => onRestore(b.id)}
                disabled={pendingId === b.id}
                className="font-medium text-accent hover:underline disabled:opacity-50"
              >
                {pendingId === b.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
