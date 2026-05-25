"use client";

import { useState, type ReactNode } from "react";

/**
 * Phase REBUILD-2 P1 correction — Workspace tabs.
 *
 * Five-tab bar sitting between the OperatorHeader and the workflow
 * content. Active tab renders its content; inactive tabs are kept
 * mounted but hidden via display:none so their local state survives
 * tab switches (operator types in Quote Range, jumps to Load Details
 * to check intake data, jumps back — the rate values are still there).
 *
 * Tabs:
 *   1. Load Details    — auto-fill intake data + customer documents
 *   2. Quote Range     — primary range proposal workspace
 *   3. Finalized Quote — rate confirmation workspace (REBUILD-3)
 *   4. BOL             — Bill of Lading execution paperwork (REBUILD-3)
 *   5. Payments        — placeholder, REBUILD-3
 *
 * Documents & Photos live as a section inside the Load Details card
 * (below Freight), not as a peer tab — they're supporting evidence
 * for the load, not a separate workflow.
 *
 * Visual: industrial dispatch tab bar — text-only labels with a HARBLANC
 * red bottom border under the active tab. Horizontally scrollable on
 * mobile so all five tabs are reachable without a hamburger.
 */

type TabId = "quote_range" | "load_details" | "finalized" | "bol" | "payments";

type TabDef = { id: TabId; label: string; placeholder?: boolean };

const TABS: TabDef[] = [
  { id: "load_details", label: "Load details" },
  { id: "quote_range", label: "Quote range" },
  { id: "finalized", label: "Finalized quote" },
  { id: "bol", label: "BOL" },
  { id: "payments", label: "Payments", placeholder: true },
];

export function WorkspaceTabs({
  quoteRangeContent,
  loadDetailsContent,
  finalizedQuoteContent,
  bolContent,
}: {
  quoteRangeContent: ReactNode;
  loadDetailsContent: ReactNode;
  finalizedQuoteContent: ReactNode;
  bolContent: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("load_details");

  return (
    <div>
      <TabBar tab={tab} setTab={setTab} />
      <div className="mt-3.5">
        <div className={tab === "quote_range" ? "" : "hidden"}>
          {quoteRangeContent}
        </div>
        <div className={tab === "load_details" ? "" : "hidden"}>
          {loadDetailsContent}
        </div>
        <div className={tab === "finalized" ? "" : "hidden"}>
          {finalizedQuoteContent}
        </div>
        <div className={tab === "bol" ? "" : "hidden"}>
          {bolContent}
        </div>
        <div className={tab === "payments" ? "" : "hidden"}>
          <PlaceholderTab
            title="Payments"
            subtitle="Payment recording + outstanding balance tracking against the finalized quote. Workflow lands in REBUILD-3."
          />
        </div>
      </div>
    </div>
  );
}

function TabBar({
  tab,
  setTab,
}: {
  tab: TabId;
  setTab: (next: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Workspace sections"
      className="overflow-x-auto border-b border-zinc-400 bg-white"
    >
      <div className="flex min-w-fit divide-x divide-zinc-300">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={
                "shrink-0 border-b px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition-colors focus:outline-none sm:px-4 " +
                (active
                  ? "border-red-600 text-black"
                  : "border-transparent text-black hover:bg-zinc-50") +
                (t.placeholder ? " opacity-50" : "")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlaceholderTab({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <section className="overflow-hidden rounded border border-zinc-400 bg-white p-6 text-center sm:p-10">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-600">
        Coming in REBUILD-3
      </p>
      <h2 className="mt-3 text-xl font-bold text-black">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-black">
        {subtitle}
      </p>
    </section>
  );
}
