import type { ReactNode } from "react";
import { Micro } from "./chrome";
import { ProvenancePills } from "../../ProvenancePills";

/**
 * The company file's dark header — the name band and the three stat blocks.
 *
 * ── THE BRANDING STRIP IS GONE (Brent, 2026-08-26) ────────────────────
 *
 *   "remove this hellohotshot bar and move the addres down next to the
 *    company city and state."
 *
 * It carried a logo chip, "HELLO HOTSHOT", "COMPANY FILE" and the address.
 * Three of those four said nothing: the sidebar says Hello Hotshot on
 * every page of the app, and "COMPANY FILE" labelled a page that has the
 * company's name in 27px type directly beneath it. The address was the
 * only real content, and it sat at the far right of a bar — as far from
 * the company it belongs to as the layout allowed.
 *
 * So the strip went and the address moved into the subtitle, beside the
 * trade: one line reading "what they do, and where they are" instead of
 * two bands saying it separately. It also reclaims ~34px on every company,
 * which answers part of the density complaint for free.
 *
 * THE SEPARATE "place" (city, state) WENT WITH IT, because it would now be
 * printed twice. `fullAddress` is composed as address + city/state + zip,
 * so it already ends in the town — and for the BOL-created companies,
 * whose city/state columns are null and whose entire address lives in one
 * text blob, the town is inside that blob as well. One value, shown once.
 *
 * NOT TRUNCATED. Measured before deciding: across the 85 companies that
 * have an address the longest composed value is 71 characters and the
 * average is 28, and only 6 of 99 would push the whole subtitle past 75.
 * That fits this header at 12px with room to spare, so the address renders
 * in full. `truncate` stays on the line purely as a guard against some
 * future pathological value breaking the layout — it is not expected to
 * fire on today's data, and the full string is in the link title either
 * way.
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

export type FileHeaderProps = {
  accountName: string;
  industry: string | null;
  /** The composed address — street, city, state, zip. Rendered whole, in
   * the subtitle, as a Maps link. */
  fullAddress: string | null;
  ownerLabel: string | null;
  /** The "reassign" control, rendered as a quiet underlined link. */
  reassign?: ReactNode;
  onFileDays: number;
  createdLabel: string | null;
  gapCount: number;
  /** What the gaps actually are, e.g. "contact, carrier, spend". */
  gapSummary: string | null;
  /** crm_accounts.source — otr / manual / bol. */
  source: string | null;
  /** crm_accounts.bol_role — shipper / receiver / broker, or null. */
  bolRole: string | null;
  /** The section switcher, rendered flush to the BOTTOM of the dark band so
   * the active folder tab's white meets the surface below with no seam.
   * Supplied by FileBody, which owns which tab is open. */
  tabs?: ReactNode;
};

export function FileHeader({
  accountName,
  industry,
  fullAddress,
  ownerLabel,
  reassign,
  onFileDays,
  createdLabel,
  gapCount,
  gapSummary,
  source,
  bolRole,
  tabs,
}: FileHeaderProps) {
  const mapHref = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  return (
    <header>
      {/* ── Name band ─────────────────────────────────────────────── */}
      {/* pb shrinks when tabs are present — they supply the band's bottom
          edge themselves, and padding under them would break the seam. */}
      <div
        className={`flex items-end gap-6 bg-graphite px-4 pt-3.5 ${tabs ? "pb-0" : "pb-4"}`}
      >
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[27px] font-extrabold leading-none tracking-[-0.02em] text-white">
            {accountName}
          </h1>
          {(industry || fullAddress) && (
            <p className="mt-2 flex items-center gap-1.5 truncate text-[12px]">
              {industry && <span className="shrink-0 font-bold text-white/90">{industry}</span>}
              {industry && fullAddress && (
                <span aria-hidden className="shrink-0 text-white/35">
                  ·
                </span>
              )}
              {fullAddress && (
                <>
                  {/* The pin still earns its place inline: on a band this
                      dark it is what says "this is a location" before the
                      eye has read a word of it. */}
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 shrink-0 fill-none stroke-white/50 stroke-2"
                  >
                    <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  {mapHref ? (
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noreferrer"
                      title={fullAddress}
                      className="min-w-0 truncate text-white/70 underline decoration-white/30 underline-offset-2 hover:text-white hover:decoration-white"
                    >
                      {fullAddress}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate text-white/70">{fullAddress}</span>
                  )}
                </>
              )}
            </p>
          )}

          {/* PROVENANCE, under the name and level with the Owner block.
              Brent asked for these "near the sales agent assign area";
              this is that band, and it is also simply where the eye
              already is — a pill three inches from the company name gets
              read on the way past, which a pill in a side rail does not.
              See ProvenancePills for the colour reasoning and the measured
              contrast against this near-black header. */}
          <ProvenancePills source={source} bolRole={bolRole} onDark className="mt-2.5" />
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

      {/* Flush to the bottom of the dark band. */}
      {tabs && <div className="bg-graphite px-4 pt-3">{tabs}</div>}
    </header>
  );
}
