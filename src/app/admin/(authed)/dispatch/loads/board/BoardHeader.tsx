"use client";

import { ChevronDownIcon, ExportIcon, SettingsIcon } from "./icons";

/**
 * The board's masthead — a navy slab that carries the page identity and the
 * three board-level controls: the month slice, the CSV export of what's on
 * screen, and a settings affordance held for a future board-preferences sheet.
 *
 * The slab is a FIXED dark surface (an explicit navy gradient, not bg-panel),
 * so everything on it is fixed-light: white text, white/10 control fills,
 * white/15 hairlines. That is the only way a header this dark can render the
 * same under both admin themes — a themed token here would flip to a light
 * fill under admin-light and drop the white labels to ~1.2:1.
 *
 * The <select> gets an explicit solid navy background rather than a translucent
 * one because the browser paints the dropdown's OPTION list with the control's
 * own background: white-on-transparent would open as white-on-white.
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
    <header className="relative overflow-hidden rounded-2xl bg-[#0f172a] bg-gradient-to-br from-[#16203a] via-[#0f172a] to-[#080d18] shadow-e3">
      {/* Texture: one soft off-center highlight so the slab reads as a lit
          surface rather than a flat rectangle. Purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10"
      />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/45">
            Dispatch
          </div>
          <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[34px]">
            Load Board
          </h1>
          <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-white/60 sm:text-[14px]">
            Manage active freight, monthly performance, and dispatch operations.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Month filter — unchanged in behaviour, restyled onto the slab.
              Still the primary slice: it drives the performance card, the six
              KPIs and the list off this one value. */}
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Month</span>
            <select
              value={month === "all" ? "all" : String(month)}
              onChange={(e) =>
                onMonthChange(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="h-[38px] w-full appearance-none rounded-xl border border-white/15 bg-[#1a2338] py-0 pl-3.5 pr-9 text-[13px] font-semibold text-white outline-none transition-colors hover:border-white/30 focus:border-white/50 focus:ring-2 focus:ring-white/20 sm:w-[160px]"
            >
              <option value="all">All months</option>
              {months.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
          </label>

          <button
            type="button"
            onClick={onExport}
            title={`Download ${exportCount} load${exportCount === 1 ? "" : "s"} as CSV`}
            className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 text-[13px] font-semibold text-white transition-all duration-150 hover:bg-white/20 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
          >
            <ExportIcon className="h-4 w-4" />
            Export
          </button>

          {/* Placeholder for board preferences. Disabled on purpose — it holds
              the slot (and the visual balance) for a settings sheet that does
              not exist yet, rather than shipping a control that goes nowhere. */}
          <button
            type="button"
            disabled
            aria-label="Board settings (coming soon)"
            title="Board settings — coming soon"
            className="inline-flex h-[38px] w-[38px] shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-white/10 text-white/35"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
