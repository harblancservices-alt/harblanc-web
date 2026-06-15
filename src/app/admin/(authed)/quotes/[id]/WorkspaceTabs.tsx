"use client";

import { useEffect, useState, type ReactNode } from "react";

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
  { id: "finalized", label: "Finalized quote" },
  { id: "bol", label: "BOL" },
  { id: "payments", label: "Payments", placeholder: true },
];

export function WorkspaceTabs({
  loadDetailsContent,
  finalizedQuoteContent,
  bolContent,
}: {
  loadDetailsContent: ReactNode;
  finalizedQuoteContent: ReactNode;
  bolContent: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("load_details");

  // Cross-tab navigation hook. LoadDetailsCard's footer button (and any
  // future "go to tab X" affordance from inside a tab body) dispatches
  // a window-level CustomEvent rather than threading a callback down.
  // We listen here and switch the active tab when the detail names a
  // tab we know about. Decouples LoadDetailsCard from the parent's
  // tab state without prop drilling.
  useEffect(() => {
    function onAdvance(e: Event) {
      const ce = e as CustomEvent<{ to: TabId }>;
      const next = ce.detail?.to;
      if (next && TABS.some((t) => t.id === next && !t.placeholder)) {
        setTab(next);
      }
    }
    window.addEventListener("workspace-advance", onAdvance);
    return () => window.removeEventListener("workspace-advance", onAdvance);
  }, []);

  return (
    <div>
      <TabBar tab={tab} setTab={setTab} />
      <div className="mt-3.5">
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
      className="overflow-x-auto border-b-2 border-line bg-[#fafaf6]"
    >
      <div className="flex min-w-fit">
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
                // Hierarchy:
                //   Active   → solid red tab (bg-canvas) with white bold
                //              text and a darker red underline. Reads as
                //              a stamped/selected tab, not a label.
                //   Inactive → cream bg, black bold text, no underline.
                //   Placeholder → black text, not-allowed cursor.
                "-mb-[2px] inline-flex shrink-0 items-center gap-2 border-b-[3px] px-3.5 py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.16em] transition-colors focus:outline-none sm:px-4 " +
                (active
                  ? "border-line bg-canvas font-black text-fg"
                  : "border-transparent text-fg hover:bg-[#f3f1e9]") +
                (t.placeholder ? " cursor-not-allowed text-fg" : "")
              }
              disabled={t.placeholder}
            >
              {/* Vertical accent bar — white on the active red tab so it
                  still reads, transparent on inactive tabs. */}
              <span
                aria-hidden
                className={
                  "inline-block h-[12px] w-[3px] shrink-0 " +
                  (active ? "bg-card" : "bg-transparent")
                }
              />
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
    <section className="border border-line border-l-4 border-l-black bg-[#fafaf6] p-6 text-center sm:p-10">
      <p className="font-mono text-[12px] font-bold uppercase tracking-[0.22em] text-fg">
        Not built yet
      </p>
      <h2 className="mt-3 font-mono text-2xl font-bold uppercase tracking-[0.1em] text-fg">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-fg">
        {subtitle}
      </p>
    </section>
  );
}
