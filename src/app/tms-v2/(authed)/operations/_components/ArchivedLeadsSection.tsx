"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { restoreLead, permanentlyDeleteLead, restoreLeads, permanentlyDeleteLeads } from "@/actions/tms-v2/quotes";
import type { ArchivedLeadRow } from "@/lib/data/pipeline";

/** Quote requests' trash list — same shape as ArchivedApplicationsSection
 * (Phase 6 item 3): per-row Restore/Delete plus a bulk selection bar. Not
 * linked to the detail route — getPipelineDetail() 404s on a trashed lead
 * (deleted_at is a hard exclusion there, unlike getApplicationDetail's
 * trash-tolerant read), so the name renders as plain text here. */
export function ArchivedLeadsSection({ leads }: { leads: ArchivedLeadRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  if (leads.length === 0) return null;

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
    const result = await restoreLead(id);
    setPendingId(null);
    if (!result.ok) {
      alert(result.reason);
      return;
    }
    router.refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this quote request permanently? This cannot be undone.")) return;
    setPendingId(id);
    const result = await permanentlyDeleteLead(id);
    setPendingId(null);
    if (!result.ok) alert(result.reason);
    router.refresh();
  }

  async function onBulkRestore() {
    setBulkPending(true);
    const res = await restoreLeads(Array.from(selected));
    setBulkPending(false);
    if (!res.ok) alert(res.reason);
    setSelected(new Set());
    router.refresh();
  }

  async function onBulkDelete() {
    if (!confirm(`Delete ${selected.size} quote request${selected.size === 1 ? "" : "s"} permanently? This cannot be undone.`)) return;
    setBulkPending(true);
    const res = await permanentlyDeleteLeads(Array.from(selected));
    setBulkPending(false);
    if (!res.ok) alert(res.reason);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[13px] font-medium text-fg-muted hover:text-fg">
        {open ? "▾" : "▸"} Archived quote requests ({leads.length})
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
            {leads.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => onToggle(l.id)} aria-label={`Select ${l.name}`} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-fg">{l.name}</span>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onRestore(l.id)}
                    disabled={pendingId === l.id}
                    className="font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {pendingId === l.id ? "…" : "Restore"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(l.id)}
                    disabled={pendingId === l.id}
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
