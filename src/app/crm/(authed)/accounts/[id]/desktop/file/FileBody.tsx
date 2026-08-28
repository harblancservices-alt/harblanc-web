"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { FileHeader, type FileHeaderProps } from "./FileHeader";
import { HeaderTabs } from "./HeaderTabs";
import { WhatWeKnow } from "./WhatWeKnow";
import { WhoDoICall, type CallPerson } from "./WhoDoICall";
import { StageStrip } from "./StageStrip";
import { WhatHappened } from "./WhatHappened";
import { FileCard, SectionHead } from "./chrome";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";
import type { QuickTask } from "../../../../admin/quick-task-actions";

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
  quickTasks,
  taskOwnerLabel,
  people,
  companyPhones,
  companyDefaults,
  reps,
  historyPanel,
  tasksPanel,
  knowProps,
  contactsPanel,
  shipmentsPanel,
  shipmentCount,
  finalizeBanner,
  header,
}: {
  accountId: string;
  stage: string;
  composerContacts: { id: string; name: string; phoneLabel: string | null }[];
  /** Passed through to the composer's Task tab — see WhatHappened's note on
   * why this is threaded rather than fetched there. */
  quickTasks: QuickTask[];
  taskOwnerLabel: string | null;
  people: CallPerson[];
  companyPhones: { label: string; number: string }[];
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  historyPanel: ReactNode;
  tasksPanel: ReactNode;
  /** WhatWeKnow's props rather than a rendered node: this component owns
   * the open tab, and the BOL viewer inside it must be told when its tab is
   * showing so it can defer fetching the PDF until then. */
  knowProps: Omit<React.ComponentProps<typeof WhatWeKnow>, "active">;
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {finalizeBanner}

        {/* Hidden rather than unmounted: the shipments panel is already in
            the payload, and keeping the others mounted means a half-typed
            gap value survives a glance at Contacts. */}
        <div hidden={tab !== "overview"} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* The composer — Overview only, per Brent. */}
            <FileCard>
              <SectionHead title="What happened" />
              <WhatHappened
                accountId={accountId}
                contacts={composerContacts}
                stage={stage}
                quickTasks={quickTasks}
                taskOwnerLabel={taskOwnerLabel}
              />
            </FileCard>

            {/* THE CARDS USE THE HEIGHT THEY HAVE. They used to size to
                their content and stop, leaving ~400px of empty canvas
                beneath on a tall monitor.

                flex-1 in a chain that starts at CompanyFile's min-h-screen,
                NOT a calc: a hardcoded offset has to know how tall the
                chrome above it is, and that moves per company — the
                composer grows when there are contacts to pick from, the
                header grows when the subtitle wraps. The first attempt used
                calc(100vh-350px) and overshot the viewport by 72px on the
                first company it was measured against.

                min-h-0 on every link in the chain because a flex item's
                default min-height:auto refuses to shrink below its content,
                which is what makes a nested flex column silently overflow
                instead of fitting. items-stretch does the rest — each card
                ends in a footer pinned with mt-auto or a flex-1 body, so
                they grow downward rather than floating. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1.05fr)] items-stretch gap-3">
              <WhoDoICall
                accountId={accountId}
                companyName={header.accountName}
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

        <div hidden={tab !== "know"} className="flex min-h-0 flex-1 flex-col">
          <WhatWeKnow {...knowProps} active={tab === "know"} />
        </div>
        <div hidden={tab !== "contacts"} className="flex min-h-0 flex-1 flex-col">{contactsPanel}</div>
        {/* ShipmentsTab brings its own body and empty state but no card —
            it was built as a tab panel inside the old profile's chrome. It
            gets the same FileCard + header as its peers here so the four
            tabs do not each look like a different kind of surface. */}
        {/* flex-1 + min-h-0 the whole way down, the same chain the other
            three tabs use. Without it this card sized to its content and
            stopped — a 110px strip in a 745px window with ~500px of bare
            canvas under it, on the one tab most likely to be empty. */}
        <div hidden={tab !== "shipments"} className="flex min-h-0 flex-1 flex-col">
          <FileCard className="flex min-h-0 flex-1 flex-col">
            <SectionHead
              title="Shipments"
              count={
                shipmentCount === 0
                  ? "no loads yet"
                  : `${shipmentCount} ${shipmentCount === 1 ? "load" : "loads"}`
              }
            />
            <div className="min-h-0 flex-1 overflow-auto">{shipmentsPanel}</div>
          </FileCard>
        </div>
      </div>
    </>
  );
}
