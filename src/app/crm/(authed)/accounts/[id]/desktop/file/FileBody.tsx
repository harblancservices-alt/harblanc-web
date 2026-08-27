"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { FileHeader, type FileHeaderProps } from "./FileHeader";
import { HeaderTabs } from "./HeaderTabs";
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
 * ── THE ORDER, AND WHAT SITS INSIDE THE TABS ──────────────────────────
 *
 *   dark header  ->  stage strip  ->  tabs  ->  tab content
 *
 * THE STAGE STRIP IS ABOVE THE TABS (Brent, 2026-08-26), and it is the
 * better arrangement: where a company sits in the funnel is true whichever
 * tab you are on, so it belongs with the header material rather than
 * floating above a row that governs something else. The tabs then sit
 * directly on top of the content they actually switch.
 *
 * THE COMPOSER IS INSIDE OVERVIEW. This reverses an earlier call — it used
 * to sit outside the tabs, on the reasoning that "What happened" is the
 * only place this page writes and burying it in a tab means changing tabs
 * to log a call you just made. Brent overruled that. It renders on Overview
 * and nowhere else.
 *
 * ── KEEPING THE STRIP AND THE TAB ROW APART, NOW THEY HAVE SWAPPED ────
 *
 * They used to be separated by a tonal step in the other direction: tabs on
 * --canvas above, strip white and full-bleed below. Reversed, the same
 * three devices still do the work, and one of them now does a second job:
 *
 *   GROUND     the strip is --card (white) and full-bleed; the tab row is
 *              on --canvas. The step is unchanged, just inverted.
 *   CLOSURE    the strip's --line-strong bottom rule is what ends the
 *              header block. Above it: who they are and where they are in
 *              the funnel. Below it: what you are looking at.
 *   SHARED GROUND, DELIBERATELY — the tab row and the content beneath it
 *              are on the SAME canvas, inside one padded column. That is
 *              the point: tabs and the panels they switch should read as
 *              one unit, distinct from the chrome above. When the tabs sat
 *              above a white strip they read as belonging to the header;
 *              they do not, they belong to the content.
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
  header,
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
  /** Everything the dark band renders except the tabs, which this component
   * supplies because it owns which one is open. */
  header: Omit<FileHeaderProps, "tabs">;
}) {
  const [tab, setTab] = useState<PageTab>("overview");

  return (
    <>
      <FileHeader
        {...header}
        tabs={
          <HeaderTabs
            ariaLabel="Company sections"
            active={tab}
            onSelect={setTab}
            items={[
              { key: "overview" as const, label: LABEL.overview },
              { key: "know" as const, label: LABEL.know },
              { key: "contacts" as const, label: LABEL.contacts, count: people.length },
              { key: "shipments" as const, label: LABEL.shipments, count: shipmentCount },
            ]}
          />
        }
      />

      {/* The stage strip is the white surface the active folder tab runs
          into — see the note above about what that costs. */}
      <StageStrip accountId={accountId} current={stage} />

      <div className="flex flex-col gap-3 p-3">
        {finalizeBanner}

        {/* Hidden rather than unmounted: the shipments panel is already in
            the payload, and keeping the others mounted means a half-typed
            gap value survives a glance at Contacts. */}
        <div hidden={tab !== "overview"}>
          <div className="flex flex-col gap-3">
            {/* The composer — Overview only, per Brent. */}
            <FileCard>
              <SectionHead title="What happened" />
              <WhatHappened accountId={accountId} contacts={composerContacts} stage={stage} />
            </FileCard>

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
