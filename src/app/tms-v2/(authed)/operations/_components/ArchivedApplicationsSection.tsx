"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  restoreApplication,
  permanentlyDeleteApplication,
  restoreApplications,
  permanentlyDeleteApplications,
} from "@/actions/tms-v2/applications";
import type { ArchivedApplicationRow } from "@/lib/data/pipeline";

/** Applications' trash list — mirrors ArchivedBrokersSection's collapsible
 * pattern, extended with a permanent-Delete button since (unlike brokers)
 * legacy applications support true hard-delete after being trashed. Also
 * carries per-row selection so multiple rows can be restored or deleted in
 * one action (Phase 6 item 3's "bulk trash/restore on Applications"). */
export function ArchivedApplicationsSection({ applications }: { applications: ArchivedApplicationRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  if (applications.length === 0) return null;

  function onToggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onRestore(id: string) {
    setPendingId(id);
    const result = await restoreApplication(id);
    setPendingId(null);
    if (!result.ok) {
      alert(result.reason);
      return;
    }
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

  async function onBulkRestore() {
    setBulkPending(true);
    const res = await restoreApplications(Array.from(selected));
    setBulkPending(false);
    if (!res.ok) alert(res.reason);
    setSelected(new Set());
    router.refresh();
  }

  async function onBulkDelete() {
    if (!confirm(`Delete ${selected.size} application${selected.size === 1 ? "" : "s"} permanently? This cannot be undone.`)) return;
    setBulkPending(true);
    const res = await permanentlyDeleteApplications(Array.from(selected));
    setBulkPending(false);
    if (!res.ok) alert(res.reason);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Archived applications ({applications.length})
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-[13px]">
              <span className="font-medium text-fg">{selected.size} selected</span>
              <button type="button" onClick={onBulkRestore} disabled={bulkPending} className="font-medium text-accent hover:underline disabled:opacity-50">
                Restore selected
              </button>
              <button type="button" onClick={onBulkDelete} disabled={bulkPending} className="font-medium text-bad hover:underline disabled:opacity-50">
                Delete selected
              </button>
              <button type="button" onClick={() => setSelected(new Set())} disabled={bulkPending} className="text-fg-muted hover:text-fg">
                Cancel
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            {applications.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggle(a.id)} aria-label={`Select ${a.name}`} className="h-4 w-4 shrink-0" />
                <Link href={`/tms-v2/operations/applications/${a.id}`} className="min-w-0 flex-1 truncate text-fg hover:underline">
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
        </div>
      ) : null}
    </div>
  );
}
