import type { ReactNode } from "react";
import { Micro } from "./chrome";

/**
 * The company file's dark header — the top strip, the name band, and the
 * three stat blocks on the right.
 *
 * ── WHAT IS REAL AND WHAT THE DESIGN ASKED FOR ────────────────────────
 *
 * OWNER and ON FILE are straight reads: crm_accounts.assigned_user_id and
 * created_at. "5 days · since Aug 21" on the mockup is exactly what the
 * real Fritz record produces, so that block needed nothing invented.
 *
 * GAPS is the count from file/fileGaps.ts — the SAME list panel 04 renders,
 * so the number here is always the number of rows down there.
 *
 * THE MOCKUP'S SUB-LINE "1 blocks Qualified" IS NOT RENDERED. Nothing in
 * this app gates a stage on a missing field; updateLifecycleStatus moves a
 * company anywhere at any time and refuses exactly one thing, a terminal
 * stage with no reason. The sub-line says what the gaps actually are
 * instead. See fileGaps.ts for the longer note.
 *
 * The address is a LINK to the map, as drawn — underlined, in the strip,
 * because on a header this dark an unlinked address and a linked one look
 * identical unless the underline is doing the work.
 */

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  /** The small line under the figure. Omitted rather than filled with a
   * placeholder when there is nothing true to put there. */
  sub?: ReactNode;
}) {
  return (
    <div className="min-w-0 border-l border-white/15 pl-4">
      <Micro className="block text-white/55">{label}</Micro>
      <div className="mt-1 truncate text-[17px] font-extrabold leading-none text-white">
        {value}
      </div>
      {sub ? <div className="mt-1.5 truncate text-[11px] text-white/55">{sub}</div> : null}
    </div>
  );
}

export function FileHeader({
  accountName,
  industry,
  place,
  fullAddress,
  ownerLabel,
  reassign,
  onFileDays,
  createdLabel,
  gapCount,
  gapSummary,
}: {
  accountName: string;
  industry: string | null;
  /** "Mesquite, TX" — the subtitle's second half. */
  place: string | null;
  fullAddress: string | null;
  ownerLabel: string | null;
  /** The "reassign" control, rendered as a quiet underlined link. */
  reassign?: ReactNode;
  onFileDays: number;
  createdLabel: string | null;
  gapCount: number;
  /** What the gaps actually are, e.g. "contact, carrier, spend". */
  gapSummary: string | null;
}) {
  const subtitle = [industry, place].filter(Boolean);
  const mapHref = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  return (
    <header>
      {/* ── Top strip ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 bg-graphite-2 px-4 py-2">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[3px] bg-white text-[11px] font-extrabold text-graphite">
          H
        </span>
        <Micro className="text-white">Hello Hotshot</Micro>
        <Micro className="text-white/45">Company file</Micro>

        {fullAddress && (
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 fill-none stroke-white/55 stroke-2"
            >
              <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {mapHref ? (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-[11.5px] font-bold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
              >
                {fullAddress}
              </a>
            ) : (
              <span className="min-w-0 truncate text-[11.5px] font-bold text-white">
                {fullAddress}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Name band ─────────────────────────────────────────────── */}
      <div className="flex items-end gap-6 bg-graphite px-4 pb-4 pt-3.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[27px] font-extrabold leading-none tracking-[-0.02em] text-white">
            {accountName}
          </h1>
          {subtitle.length > 0 && (
            <p className="mt-2 truncate text-[12px]">
              {industry && <span className="font-bold text-white/90">{industry}</span>}
              {industry && place && <span className="px-1.5 text-white/35">·</span>}
              {place && <span className="text-white/60">{place}</span>}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-4">
          <Stat
            label="Owner"
            value={ownerLabel ?? <span className="text-white/50">Unassigned</span>}
            sub={reassign}
          />
          <Stat
            label="On file"
            value={`${onFileDays} ${onFileDays === 1 ? "day" : "days"}`}
            sub={createdLabel ? `since ${createdLabel}` : undefined}
          />
          <Stat
            label="Gaps"
            value={gapCount}
            sub={gapCount === 0 ? "nothing missing" : gapSummary ?? undefined}
          />
        </div>
      </div>
    </header>
  );
}
