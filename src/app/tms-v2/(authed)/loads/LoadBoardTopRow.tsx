"use client";

import { IconTrash } from "@/lib/nav/icons";
import { MonthDropdown, type LoadBoardView } from "./MonthDropdown";
import { useLoadBoardSelection } from "./LoadBoardSelectionProvider";

/** Load Board's top row — per Brent's follow-up, Delete moved off the
 * button row below and up here as a small trash-icon button beside the
 * month dropdown, both grouped on the right. Tapping it enters the same
 * delete/select mode the old "Delete" button did (LoadBoardSelectionProvider,
 * shared with LoadBoardListClient's card grid). Hidden once already in
 * select mode (the selection bar's own Cancel takes over) or when there
 * are no loads to delete. */
export function LoadBoardTopRow({ year, view, hasLoads }: { year: number; view: LoadBoardView; hasLoads: boolean }) {
  const { selectMode, enterSelectMode } = useLoadBoardSelection();

  return (
    <div className="flex items-center justify-end gap-2">
      <MonthDropdown year={year} view={view} />
      {!selectMode && hasLoads ? (
        <button
          type="button"
          onClick={enterSelectMode}
          aria-label="Delete loads"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-card text-fg-muted shadow-e1 transition-colors hover:border-bad/40 hover:bg-bad-bg hover:text-bad"
        >
          <IconTrash className="h-[18px] w-[18px]" />
        </button>
      ) : null}
    </div>
  );
}
