"use client";

import { ChevronDownIcon, ExportIcon } from "./icons";

/**
 * The board's top control row — a plain row on the normal page background (no
 * dark slab, no title, no settings affordance): the month slice on the left and
 * the CSV export of what's on screen on the right.
 *
 * Both controls use themed tokens (bg-card / border-line / text-fg) so they
 * read correctly on the page canvas under both admin themes. The <select> gets
 * a solid card background rather than a translucent one because the browser
 * paints the dropdown's OPTION list with the control's own background.
 */
export function BoardHeader({
  months,
  month,
  onMonthChange,
  onExport,
  exportCount,
}: {
  months: ReadonlyArray<string>;
  month: number | "all";
  onMonthChange: (m: number | "all") => void;
  onExport: () => void;
  /** How many loads the export would write — shown so it's never a surprise. */
  exportCount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* Month filter — unchanged in behaviour. Still the primary slice: it
          drives the performance card, the six KPIs and the list off this one
          value. */}
      <label className="relative min-w-0">
        <span className="sr-only">Month</span>
        <select
          value={month === "all" ? "all" : String(month)}
          onChange={(e) =>
            onMonthChange(
              e.target.value === "all" ? "all" : Number(e.target.value),
            )
          }
          className="h-[40px] w-full appearance-none rounded-xl border border-line bg-card py-0 pl-3.5 pr-9 text-[13px] font-semibold text-fg shadow-e1 outline-none transition-colors hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/30 sm:w-[160px]"
        >
          <option value="all">All months</option>
          {months.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
      </label>

      <button
        type="button"
        onClick={onExport}
        title={`Download ${exportCount} load${exportCount === 1 ? "" : "s"} as CSV`}
        className="inline-flex h-[40px] shrink-0 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-[13px] font-semibold text-fg shadow-e1 transition-all duration-150 hover:border-line-strong active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ExportIcon className="h-4 w-4" />
        Export
      </button>
    </div>
  );
}
