"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { LoadCard } from "./LoadCard";
import { AddLoadButton } from "./AddLoadButton";
import { bulkDeleteLoads } from "@/actions/tms-v2/loads";
import type { MutationResult } from "@/lib/demo/mutation";
import type { LoadWithFinancials } from "@/lib/data/loads";

/** The Load Board's action row (+ New Load / Inquiry / Delete) and the
 * rich LoadCard grid with bulk-delete select mode — mirroring legacy's
 * LoadBoardView.tsx operation (the three-button row, the search-adjacent
 * delete-selection bar, tap-a-card-to-select). New Load and the card
 * grid's row links stay real <Link>/modal state; only selection is
 * client-local, matching the "URL state for navigation, local state for
 * an in-progress bulk action" split already used on Expenses/Applications/
 * Quotes bulk actions. */
export function LoadBoardListClient({
  loads,
  rowHrefBase,
  brokerNames,
  activeTripNames,
  emptyMessage,
}: {
  loads: LoadWithFinancials[];
  /** Query string (no leading "?", no `id`) already carrying year/month/
   * status/brokerId/q/page — appended with `&id=` per card. A plain
   * string, not a rowHref(id) function: this component is "use client"
   * and can't receive an arbitrary closure from the Server Component page
   * that renders it. */
  rowHrefBase: string;
  brokerNames: string[];
  activeTripNames: string[];
  emptyMessage: string;
}) {
  function rowHref(id: string): string {
    return `/tms-v2/loads?${rowHrefBase}&id=${id}`;
  }
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function onDeleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} load${selected.size === 1 ? "" : "s"}? Recoverable later from Archived loads.`)) return;
    setPending(true);
    setError(null);
    const result: MutationResult = await bulkDeleteLoads(Array.from(selected));
    setPending(false);
    if (result.ok) {
      exitSelectMode();
      router.refresh();
    } else {
      setError(result.reason);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          <AddLoadButton brokerNames={brokerNames} activeTripNames={activeTripNames} showFab={false} />
        </div>
        <Link
          href="/tms-v2/load-inquiry"
          className="flex flex-1 items-center justify-center rounded-md border border-line-strong bg-card px-4 text-[15px] font-medium text-fg shadow-e1 hover:bg-elevated"
        >
          Inquiry
        </Link>
        {!selectMode && loads.length > 0 ? (
          <Button type="button" variant="destructive" onClick={() => setSelectMode(true)} className="flex-1">
            Delete
          </Button>
        ) : null}
      </div>

      {selectMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bad/40 bg-bad-bg px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSelected(selected.size === loads.length ? new Set() : new Set(loads.map((l) => l.id)))}
            >
              {selected.size === loads.length && loads.length > 0 ? "Clear all" : "Select all"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={exitSelectMode} disabled={pending}>
              Cancel
            </Button>
            <span className="text-[13px] text-bad">{selected.size} selected</span>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={onDeleteSelected} disabled={pending || selected.size === 0} aria-busy={pending}>
            {pending ? "Deleting…" : "Delete selected"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

      {loads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-card px-4 py-10 text-center shadow-e1">
          <p className="text-[13px] text-fg-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {loads.map((l) => (
            <LoadCard
              key={l.id}
              load={l}
              href={rowHref(l.id)}
              selectable={selectMode}
              selected={selected.has(l.id)}
              onToggle={() => toggle(l.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
