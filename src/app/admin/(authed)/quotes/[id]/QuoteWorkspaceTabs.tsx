"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Level 5 Step 5.2 - Quote workspace tabs (V3 shell only).
 *
 * Replaces the prior WorkspaceTabs.tsx (4 tabs: load_details / finalized
 * / bol / payments-placeholder). The V3 portal uses 5 tabs:
 *
 *   Overview   - lane + range + stage at a glance
 *   Details    - shipper / consignee / freight (auto-saved at 5.5)
 *   Pricing    - Range <-> Finalized segmented control (5.6)
 *   Documents  - customer uploads + BOL sub-section (5.7)
 *   Timeline   - DispatchLifecycle pipeline + History feed (5.4)
 *
 * Default landing tab: overview (per Step 5.2 spec).
 *
 * KEEP-MOUNTED STRATEGY (preserved verbatim from the prior shell).
 * Every tab body stays in the DOM, hidden via display:none on inactive
 * tabs. Reasons:
 *   - Pricing tab segmented control (5.6) toggles Range/Finalized
 *     without losing in-progress form state, fingerprints, or preview
 *     modal state.
 *   - Details tab (5.5) onBlur saves don't race with tab-switch
 *     unmounts.
 *   - Timeline tab (5.4) doesn't re-fetch dispatch_events on every
 *     switch back.
 *
 * CROSS-TAB NAV (preserved verbatim).
 * Window-level "workspace-advance" CustomEvent listener:
 *   window.dispatchEvent(
 *     new CustomEvent("workspace-advance", { detail: { to: "pricing" } })
 *   );
 * Decouples deep children from the parent tab state without prop
 * drilling. Pre-flight confirmed there are zero existing dispatchers
 * outside the (deleted) WorkspaceTabs container, so the union shape
 * is safe to redefine to the new QuoteTabId.
 *
 * VISUAL.
 * V3 text-only tabs with a red bottom-border underline on the active
 * tab. No solid-red filled tab (that was a prior iteration; the V3
 * baseline locked text + underline only). Black bottom rule under the
 * tab bar grounds the active underline. Equal-width flex distribution
 * so all five tabs fit a mobile viewport without horizontal scroll.
 *
 * STEP 5.2 SCOPE: SHELL ONLY.
 * Tab bodies are accepted as ReactNode props. Content migration:
 *   - overview   -> Step 5.3
 *   - timeline   -> Step 5.4
 *   - details    -> Step 5.5
 *   - pricing    -> Step 5.6
 *   - documents  -> Step 5.7
 * Existing WorkspaceTabs.tsx + workspace components remain untouched
 * until their respective steps land.
 */

export type QuoteTabId =
  | "overview"
  | "details"
  | "pricing"
  | "documents";

type TabDef = { id: QuoteTabId; label: string };

const TABS: ReadonlyArray<TabDef> = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "pricing", label: "Pricing" },
  { id: "documents", label: "Documents" },
];

export type QuoteWorkspaceTabsProps = {
  overviewContent: ReactNode;
  detailsContent: ReactNode;
  pricingContent: ReactNode;
  documentsContent: ReactNode;
  /** Level 8.1: page.tsx computes the landing tab from row.lead_status —
   *  Details for active work states (new, contacted, estimate_sent,
   *  awaiting_*, ready_to_dispatch), Overview for later states. Falls
   *  back to "overview" if not provided. */
  initialTab?: QuoteTabId;
};

export function QuoteWorkspaceTabs({
  overviewContent,
  detailsContent,
  pricingContent,
  documentsContent,
  initialTab = "overview",
}: QuoteWorkspaceTabsProps) {
  const [tab, setTab] = useState<QuoteTabId>(initialTab);

  // workspace-advance listener - identical structure to the prior
  // shell, with the union widened to QuoteTabId. The known-tab guard
  // means a stale dispatch with an old TabId ("load_details" /
  // "quote_range" / "payments") silently no-ops instead of crashing.
  useEffect(() => {
    function onAdvance(e: Event) {
      const ce = e as CustomEvent<{ to: QuoteTabId }>;
      const next = ce.detail?.to;
      if (next && TABS.some((t) => t.id === next)) {
        setTab(next);
      }
    }
    window.addEventListener("workspace-advance", onAdvance);
    return () => window.removeEventListener("workspace-advance", onAdvance);
  }, []);

  return (
    <div>
      <TabBar tab={tab} setTab={setTab} />
      {/* Keep-mounted: every body stays in the DOM. Inactive tabs
          render with `hidden` so React preserves their internal state
          across switches. */}
      <div className="mt-3.5">
        <div
          role="tabpanel"
          aria-labelledby="tab-overview"
          className={tab === "overview" ? "" : "hidden"}
        >
          {overviewContent}
        </div>
        <div
          role="tabpanel"
          aria-labelledby="tab-details"
          className={tab === "details" ? "" : "hidden"}
        >
          {detailsContent}
        </div>
        <div
          role="tabpanel"
          aria-labelledby="tab-pricing"
          className={tab === "pricing" ? "" : "hidden"}
        >
          {pricingContent}
        </div>
        <div
          role="tabpanel"
          aria-labelledby="tab-documents"
          className={tab === "documents" ? "" : "hidden"}
        >
          {documentsContent}
        </div>
      </div>
    </div>
  );
}

function TabBar({
  tab,
  setTab,
}: {
  tab: QuoteTabId;
  setTab: (next: QuoteTabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Workspace sections"
      className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black sm:sticky sm:top-14 sm:border-b sm:border-black sm:bg-white"
    >
      <div className="flex">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tabpanel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={
                // flex-1 distributes equal widths across all tabs so the
                // labels fit a 360px viewport. -mb-[1px] lifts the
                // 3px active underline through the parent's bottom
                // border for a flush rule.
                "flex-1 whitespace-nowrap border-b-[3px] px-1.5 py-3 text-center font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] transition-colors -mb-[1px] focus:outline-none sm:px-3 sm:text-[11px] sm:tracking-[0.14em] " +
                (active
                  ? "border-red-700 text-white sm:border-black sm:text-black"
                  : "border-transparent text-white/70 hover:text-white sm:text-black sm:hover:text-black")
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
