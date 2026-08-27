"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { WhoDoICall, type CallPerson } from "./WhoDoICall";
import { RecordTabs, type RecordTab } from "./RecordTabs";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";

/**
 * The lower half of the company file: the three reading panels, and the
 * tabbed record beneath them.
 *
 * ── WHY THIS COMPONENT EXISTS ─────────────────────────────────────────
 *
 * One piece of state — which record tab is open — is needed in two places
 * that are not parent and child: the Contacts TAB at the bottom, and panel
 * 01's "+3 more — open Contacts" hand-off at the top. That hand-off is the
 * whole reason the two panels are not duplicates of each other (see
 * ContactsTab.tsx), so it has to actually work.
 *
 * The first attempt put that state in a React context whose provider was
 * rendered by CompanyFile, a SERVER component. It failed, and it failed in
 * the worst way available: the server render succeeded and the CLIENT
 * render threw "useRecordTabs must be used inside RecordTabsProvider",
 * which aborts hydration for the ENTIRE page. The result looked completely
 * fine in a screenshot — every panel painted, every value correct — but
 * nothing on the page responded to a click. Not the tabs, not the stage
 * strip, not the composer. A screenshot cannot catch that; only clicking
 * something can, which is why it was caught by clicking a tab and then
 * checking for a React fiber on the node.
 *
 * So the state lives HERE instead, in one ordinary client component, and
 * moves as plain props. No context crossing a server/client boundary, and
 * no "must be used inside a provider" throw that can take down a page.
 *
 * The server-rendered panels arrive as ReactNode slots — that is the normal
 * way a Server Component's output gets composed inside a client one, and it
 * keeps ShipmentsTab's own data fetching on the server where it belongs.
 */
export function FileBody({
  accountId,
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
}: {
  accountId: string;
  people: CallPerson[];
  companyPhones: { label: string; number: string }[];
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  historyPanel: ReactNode;
  tasksPanel: ReactNode;
  knowPanel: ReactNode;
  contactsPanel: ReactNode;
  shipmentsPanel: ReactNode;
  shipmentCount: number;
}) {
  // "What we know" is the default: it is the only one of the three that
  // says something the panels above have not already said.
  const [tab, setTab] = useState<RecordTab>("know");

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1.05fr)] items-stretch gap-3">
        <WhoDoICall
          accountId={accountId}
          people={people}
          companyPhones={companyPhones}
          companyDefaults={companyDefaults}
          reps={reps}
          onOpenContacts={() => {
            setTab("contacts");
            document.getElementById("company-record")?.scrollIntoView({ block: "start" });
          }}
        />
        {historyPanel}
        {tasksPanel}
      </div>

      <div className="mt-3">
        <RecordTabs
          tab={tab}
          onTab={setTab}
          contactCount={people.length}
          shipmentCount={shipmentCount}
          knowPanel={knowPanel}
          contactsPanel={contactsPanel}
          shipmentsPanel={shipmentsPanel}
        />
      </div>
    </>
  );
}
