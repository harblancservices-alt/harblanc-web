"use client";

import type { ReactNode } from "react";
import { SegmentedTabs } from "../../../../_shell/SegmentedTabs";

import { Micro } from "./chrome";

/**
 * THE COMPANY RECORD — panel 04, now three tabs instead of one panel.
 *
 * Brent: "i think in this section i want to put the what we know tabs and a
 * contacts tab along and a shipments tab."
 *
 * WHAT WE KNOW is the default. It is the only one of the three that tells
 * you something the panels above have not already: who they are is at the
 * top, what was said is panel 02, what is owed is panel 03. This is the
 * record underneath all of it.
 *
 * ── COUNTS ON THE TABS ────────────────────────────────────────────────
 *
 * Contacts and Shipments carry a number; What we know does not, because
 * "what we know" is not a quantity — the gap count already lives in the
 * header and a second, different number beside the tab would invite the
 * reader to reconcile two figures that measure different things.
 *
 * Shipments shows its ZERO. SegmentedTabs renders a zero deliberately (it
 * is the answer to the question the tab asks), and here that matters more
 * than usual: 1 of 99 companies has a load, so "Shipments 0" is the normal,
 * correct state and it should look like an answer rather than an absence.
 * Hiding the tab on a company with no loads would be worse — the page would
 * change shape between companies and a rep would be left wondering where
 * loads went.
 */

/** The three faces of the company record. Declared here, with the
 * component that renders them, rather than in a module of its own — the
 * state that selects one lives in FileBody. */
export type RecordTab = "know" | "contacts" | "shipments";

const LABEL: Record<RecordTab, string> = {
  know: "What we know",
  contacts: "Contacts",
  shipments: "Shipments",
};

export function RecordTabs({
  tab,
  onTab,
  knowPanel,
  contactsPanel,
  shipmentsPanel,
  contactCount,
  shipmentCount,
}: {
  tab: RecordTab;
  onTab: (t: RecordTab) => void;
  knowPanel: ReactNode;
  contactsPanel: ReactNode;
  /** A Server Component handed down as a prop — ShipmentsTab does its own
   * fetch, so it is rendered on the server and simply shown or hidden here.
   * It is mounted whichever tab is active (hidden, not unmounted) so that
   * switching to Shipments never costs a round-trip. */
  shipmentsPanel: ReactNode;
  contactCount: number;
  shipmentCount: number;
}) {
  return (
    <section id="company-record" className="border border-line bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center bg-fg text-[10px] font-bold text-white crm-num">
          04
        </span>
        <Micro className="text-fg">The record</Micro>

        <SegmentedTabs
          ariaLabel="Company record"
          className="ml-1"
          items={(["know", "contacts", "shipments"] as RecordTab[]).map((key) => ({
            key,
            label: LABEL[key],
            active: tab === key,
            onSelect: () => onTab(key),
            count:
              key === "contacts" ? contactCount : key === "shipments" ? shipmentCount : undefined,
          }))}
        />

        {tab === "know" && (
          <span className="ml-auto hidden text-[11.5px] text-fg-subtle xl:block">
            Shipper record — carrier fields (MC, DOT, insurance, safety) don&apos;t render here
          </span>
        )}
      </div>

      {/* Hidden rather than unmounted: the shipments panel is server-rendered
          and already in the payload, and keeping the others mounted means a
          half-typed gap value survives a glance at Contacts. */}
      <div hidden={tab !== "know"}>{knowPanel}</div>
      <div hidden={tab !== "contacts"}>{contactsPanel}</div>
      <div hidden={tab !== "shipments"}>{shipmentsPanel}</div>
    </section>
  );
}
