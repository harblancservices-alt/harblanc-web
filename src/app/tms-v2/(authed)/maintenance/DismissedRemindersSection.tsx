"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReminderDismissed } from "@/actions/tms-v2/maintenance";
import type { DismissedReminder } from "@/lib/data/maintenance";

/** Dismissed reminders — the un-dismiss surface (QA gap: setReminderDismissed
 * (id, false) already worked end-to-end through the existing action, there
 * was just no list anywhere showing a dismissed reminder to bring back).
 * Same collapsible-trash-list pattern as ArchivedBrokersSection. */
export function DismissedRemindersSection({ reminders }: { reminders: DismissedReminder[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (reminders.length === 0) return null;

  async function onUndismiss(id: string) {
    setPendingId(id);
    await setReminderDismissed(id, false);
    setPendingId(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-fit text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Dismissed reminders ({reminders.length})
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
              <div className="min-w-0">
                <span className="text-fg">{r.label}</span>
                <span className="ml-2 text-fg-muted">
                  {r.category} · every {r.intervalMiles.toLocaleString()} mi
                </span>
              </div>
              <button
                type="button"
                onClick={() => onUndismiss(r.id)}
                disabled={pendingId === r.id}
                className="shrink-0 font-medium text-accent hover:underline disabled:opacity-50"
              >
                {pendingId === r.id ? "Restoring…" : "Un-dismiss"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
