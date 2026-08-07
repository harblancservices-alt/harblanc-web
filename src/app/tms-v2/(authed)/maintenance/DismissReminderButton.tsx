"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setReminderDismissed } from "@/actions/tms-v2/maintenance";

/** Dismiss a reminder without servicing it — closes the audit's Maintenance
 * reminder-management gap. Reversible: setReminderDismissed(id, false)
 * brings one back, now reachable via the Dismissed section's Un-dismiss
 * button (DismissedRemindersSection.tsx) below the active list. */
export function DismissReminderButton({ reminderId }: { reminderId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm("Dismiss this reminder? It won't be counted as due until re-triggered by a future service log.")) return;
    setPending(true);
    await setReminderDismissed(reminderId, true);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-[11px] font-medium text-fg-muted hover:text-fg disabled:opacity-50"
    >
      {pending ? "Dismissing…" : "Dismiss"}
    </button>
  );
}
