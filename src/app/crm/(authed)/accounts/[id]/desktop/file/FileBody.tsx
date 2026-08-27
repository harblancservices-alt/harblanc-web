"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { SegmentedTabs } from "../../../../_shell/SegmentedTabs";
import { WhoDoICall, type CallPerson } from "./WhoDoICall";
import { StageStrip } from "./StageStrip";
import { WhatHappened } from "./WhatHappened";
import { FileCard, SectionHead } from "./chrome";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";

/**
 * The company file below the header: the page tabs, the stage strip, the
 * composer, and whichever tab's content is open.
 *
 * ── THE TABS ARE AT PAGE LEVEL NOW (Brent, 2026-08-26) ────────────────
 *
 *   "i made tabs at the top above the stage bar that allowed for overview
 *    which is what youre seeing — what we know which is what the BOL parse
 *    will show, contacts and shipments for when theyre a real company and
 *    active. it gets cleaned up quite a bit with this pass."
 *
 * It does clean up. This SUPERSEDES the tab strip that lived inside panel
 * 04 — having tabs inside a card that sat on a page with no tabs was one
 * tier too many, and the card had to carry a header, a tab row and a panel
 * before it showed you anything. RecordTabs.tsx is gone; What we know,
 * Contacts and Shipments are now peers of Overview rather than things
 * buried in its fourth panel.
 *
 * ── WHAT STAYS PUT WHEN YOU SWITCH TABS ───────────────────────────────
 *
 * The stage strip and the composer are OUTSIDE the tabs, on purpose.
 *
 * Overview is defined as the three reading panels (Brent lists it as "who
 * do I call, notes & what happened, tasks"), so the composer is not part of
 * it. And that is the right call independently: "What happened" is the only
 * place this page writes, and putting it behind a tab would mean switching
 * tabs to log a call you just made while looking at somebody's contact
 * details. Same for the stage: where a company sits in the funnel is true
 * on every tab, not a fact about the Overview.
 *
 * ── HOW THE TWO FULL-WIDTH ROWS ARE KEPT APART ────────────────────────
 *
 * A tab row directly above a ten-cell stage strip is two horizontal bands
 * of chips stacked, which could easily read as one confusing block. Three
 * things separate them, and none of them is just a line:
 *
 *   GROUND     the tabs sit on --canvas (the page's blue-grey); the stage
 *              strip is on --card (white). A tonal step, so the eye reads
 *              two surfaces before it reads any content.
 *   RHYTHM     the tab row is INSET with padding; the stage strip is
 *              full-bleed, edge to edge. Different shapes, not two rows of
 *              the same thing.
 *   CLOSURE    the strip carries a --line-strong rule under it, closing it
 *              as a band and starting the page body beneath.
 *
 * Colour is exactly the previous patch's: light card headers, mid-grey
 * borders, dark numbered chips, one dark region (the page header). The
 * palette in Brent's screenshot is explicitly not being followed.
 */

export type PageTab = "overview" | "know" | "contacts" | "shipments";

const LABEL: Record<PageTab, string> = {
  overview: "Overview",
  know: "What we know",
  contacts: "Contacts",
  shipments: "Shipments",
};

export function FileBody({
  accountId,
  stage,
  composerContacts,
  people,
  companyPhones,
  companyDefaults,
  reps,
  historyPanel,
  tasksPanel,
  knowPanel,
  contactsPanel,
  shipmentsPanel,
  shipmentCount,
  finalizeBanner,
}: {
  accountId: string;
  stage: string;
  composerContacts: { id: string; name: string; phoneLabel: string | null }[];
  people: CallPerson[];
  companyPhones: { label: string; number: string }[];
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  historyPanel: ReactNode;
  tasksPanel: ReactNode;
  knowPanel: ReactNode;
  contactsPanel: ReactNode;
  /** ShipmentsTab, rendered on the server and handed down — it does its own
   * fetch, so this tree neither knows nor cares how loads are loaded. */
  shipmentsPanel: ReactNode;
  shipmentCount: number;
  finalizeBanner?: ReactNode;
}) {
  const [tab, setTab] = useState<PageTab>("overview");

  return (
    <>
      {/* ── Page tabs, on the canvas ─────────────────────────────────── */}
      <div className="bg-canvas px-3 pb-2.5 pt-3">
        <SegmentedTabs
          ariaLabel="Company sections"
          size="lg"
          items={(["overview", "know", "contacts", "shipments"] as PageTab[]).map((key) => ({
            key,
            label: LABEL[key],
            active: tab === key,
            onSelect: () => setTab(key),
            // Only the two that are a QUANTITY get a number. "Overview" and
            // "What we know" are not counts of anything, and inventing one
            // for them would make the row look like four measurements.
            count:
              key === "contacts"
                ? people.length
                : key === "shipments"
                  ? shipmentCount
                  : undefined,
          }))}
        />
      </div>

      {/* ── Stage strip: full-bleed white band, closed with a rule ───── */}
      <StageStrip accountId={accountId} current={stage} />

      <div className="flex flex-col gap-3 p-3">
        {finalizeBanner}

        {/* The composer stays on every tab — see the note above. */}
        <FileCard>
          <SectionHead title="What happened" />
          <WhatHappened accountId={accountId} contacts={composerContacts} stage={stage} />
        </FileCard>

        {/* Hidden rather than unmounted: the shipments panel is already in
            the payload, and keeping the others mounted means a half-typed
            gap value survives a glance at Contacts. */}
        <div hidden={tab !== "overview"}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1.05fr)] items-stretch gap-3">
            <WhoDoICall
              accountId={accountId}
              people={people}
              companyPhones={companyPhones}
              companyDefaults={companyDefaults}
              reps={reps}
              onOpenContacts={() => setTab("contacts")}
            />
            {historyPanel}
            {tasksPanel}
          </div>
        </div>

        <div hidden={tab !== "know"}>{knowPanel}</div>
        <div hidden={tab !== "contacts"}>{contactsPanel}</div>
        {/* ShipmentsTab brings its own body and empty state but no card —
            it was built as a tab panel inside the old profile's chrome. It
            gets the same FileCard + header as its peers here so the four
            tabs do not each look like a different kind of surface. */}
        <div hidden={tab !== "shipments"}>
          <FileCard>
            <SectionHead
              title="Shipments"
              count={
                shipmentCount === 0
                  ? "no loads yet"
                  : `${shipmentCount} ${shipmentCount === 1 ? "load" : "loads"}`
              }
            />
            {shipmentsPanel}
          </FileCard>
        </div>
      </div>
    </>
  );
}
