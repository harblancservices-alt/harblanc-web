"use client";

import { Button } from "@/components/tms-v2/ui/Button";
import { LoadCard } from "./LoadCard";
import { AddLoadButton } from "./AddLoadButton";
import { useLoadBoardSelection } from "./LoadBoardSelectionProvider";
import { withReturnTo } from "@/lib/nav/return-to";
import type { LoadWithFinancials } from "@/lib/data/loads";

/** The Load Board's Add load action and the rich LoadCard grid with
 * bulk-delete select mode. Delete itself moved up to a trash-icon button
 * in the top row (LoadBoardTopRow) beside the month dropdown — Add load
 * is the only button left here now, full-width. Select-mode state
 * (selectMode/selected/etc.) comes from LoadBoardSelectionProvider,
 * shared with that top-row trigger since the two live in different
 * PageScroll slots with no parent-child relationship of their own. New
 * Load and the card grid's row links stay real <Link>/modal state; only
 * selection is client-local, matching the "URL state for navigation,
 * local state for an in-progress bulk action" split already used on
 * Expenses/Applications/Quotes bulk actions. */
export function LoadBoardListClient({
  loads,
  brokerNames,
  activeTripNames,
  emptyMessage,
  fromPath,
}: {
  loads: LoadWithFinancials[];
  brokerNames: string[];
  activeTripNames: string[];
  emptyMessage: string;
  /** This exact board view (month/ytd/all + page) — Load Detail's back
   * button returns here instead of a reset "current month" default. */
  fromPath: string;
}) {
  // Tapping a load navigates straight to its full Load Detail page — the
  // context drawer this used to open is gone (Brent's explicit ask, now
  // that Load Detail carries every capability the drawer did and more).
  function rowHref(id: string): string {
    return withReturnTo(`/tms-v2/loads/${id}`, fromPath);
  }
  const { selectMode, selected, pending, error, exitSelectMode, toggle, selectAll, clearAll, deleteSelected } = useLoadBoardSelection();

  return (
    <div className="flex flex-col gap-3">
      <AddLoadButton brokerNames={brokerNames} activeTripNames={activeTripNames} showFab={false} variant="destructive" />

      {selectMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-bad/40 bg-bad-bg px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => (selected.size === loads.length ? clearAll() : selectAll(loads.map((l) => l.id)))}
            >
              {selected.size === loads.length && loads.length > 0 ? "Clear all" : "Select all"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={exitSelectMode} disabled={pending}>
              Cancel
            </Button>
            <span className="text-[13px] text-bad">{selected.size} selected</span>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={() => void deleteSelected()} disabled={pending || selected.size === 0} aria-busy={pending}>
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
