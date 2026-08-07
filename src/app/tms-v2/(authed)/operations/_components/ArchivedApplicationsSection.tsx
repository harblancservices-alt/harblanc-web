"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { restoreApplication, permanentlyDeleteApplication } from "@/actions/tms-v2/applications";
import type { ArchivedApplicationRow } from "@/lib/data/pipeline";

/** Applications' trash list — mirrors ArchivedBrokersSection's collapsible
 * pattern, extended with a permanent-Delete button since (unlike brokers)
 * legacy applications support true hard-delete after being trashed. */
export function ArchivedApplicationsSection({ applications }: { applications: ArchivedApplicationRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (applications.length === 0) return null;

  async function onRestore(id: string) {
    setPendingId(id);
    await restoreApplication(id);
    setPendingId(null);
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this application permanently? This cannot be undone.")) return;
    setPendingId(id);
    const result = await permanentlyDeleteApplication(id);
    setPendingId(null);
    if (!result.ok) alert(result.reason);
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Archived applications ({applications.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          {applications.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
              <Link href={`/tms-v2/operations/applications/${a.id}`} className="min-w-0 truncate text-fg hover:underline">
                {a.name}
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => onRestore(a.id)}
                  disabled={pendingId === a.id}
                  className="font-medium text-accent hover:underline disabled:opacity-50"
                >
                  {pendingId === a.id ? "…" : "Restore"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  disabled={pendingId === a.id}
                  className="font-medium text-bad hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
