"use client";

import { useState } from "react";
import { QuoteRangeWorkspace } from "../QuoteRangeWorkspace";
import {
  FinalizedQuoteWorkspace,
  type FinalizedQuoteState,
} from "../FinalizedQuoteWorkspace";

/**
 * Level 5 Step 5.6 - Pricing tab (thin wrapper).
 *
 * Highest-risk slice in the redesign. Per the Step 5.6 risk audit, the
 * implementation strategy is WRAPPER ONLY: PricingTab mounts the
 * existing QuoteRangeWorkspace and FinalizedQuoteWorkspace inside a
 * segmented control with display:none keep-mounted.
 *
 * Both workspace internals are UNTOUCHED:
 *   - No FormData key changes
 *   - No fingerprint changes
 *   - No PreviewModal changes
 *   - No server-action signature changes
 *   - No accessorial handling changes
 *   - No preview persistence changes
 *   - No email rendering changes
 *   - No PDF route changes
 *
 * The load-bearing invariant `preview_html === sent_html` is protected
 * BECAUSE this file never touches any code path that feeds it. The
 * wrapper only shows/hides containers.
 *
 * Keep-mounted strategy: both workspaces stay in the React tree even
 * when their segment is inactive. Hidden via `className="hidden"` (same
 * pattern QuoteWorkspaceTabs uses).
 *
 * State preserved across toggles:
 *   - In-progress Range form (linehaul low/high, fuel, accessorials,
 *     expiry, payment terms, special instructions) survives switching
 *     to Finalized and back.
 *   - In-progress Finalized composer (all 30+ fields, fingerprint, and
 *     in-modal PreviewModal state) survives switching to Range and back.
 *   - Each workspace owns its own PreviewModal instance - opening
 *     Range's modal doesn't affect Finalized's, and vice versa.
 *
 * Default landing segment: range. Operators build the range proposal
 * first, then later open Pricing to finalize. Range is the more common
 * entry on page open.
 *
 * Risk: HIGH (because of what surrounds it). THIS FILE: LOW
 * (wrapper only, no business logic touched).
 */

type PricingMode = "range" | "finalized";

type RangeAccessorial = { label: string; amount: number };

/**
 * Mirrors the inline `defaults` prop shape QuoteRangeWorkspace expects
 * today. Kept structural (defined here, not imported from page.tsx) to
 * avoid a circular dependency once page.tsx imports PricingTab. TypeScript
 * structural typing means this satisfies the workspace's inline type.
 */
export type PricingTabRangeDefaults = {
  linehaul_low: number | null;
  linehaul_high: number | null;
  miles_estimate: number | null;
  pickup_timing_notes: string | null;
  equipment_notes: string | null;
  dispatch_notes: string | null;
  expiration_at: string | null;
  closing_line: string | null;
  fuel_surcharge: number | null;
  accessorials: RangeAccessorial[] | null;
  payment_terms: string | null;
  special_instructions: string | null;
};

export type PricingTabProps = {
  quoteRequestId: string;
  /** Lane miles for the Range workspace's RPM widget. Null = unresolved. */
  miles: number | null;
  /** Range defaults loaded by page.tsx via loadDraftEstimate(). */
  rangeDefaults: PricingTabRangeDefaults | null;
  /** Finalized quote phase + draft/sent snapshot from loadFinalizedQuoteState(). */
  finalizedQuoteState: FinalizedQuoteState;
  /** Level 8.1: next active lead id from page.tsx — threaded through to
   *  both QuoteRangeWorkspace and FinalizedQuoteWorkspace for the
   *  "Save & open next" CTA. */
  nextLeadId: string | null;
};

export function PricingTab({
  quoteRequestId,
  miles,
  rangeDefaults,
  finalizedQuoteState,
  nextLeadId,
}: PricingTabProps) {
  const [mode, setMode] = useState<PricingMode>("range");

  return (
    <div className="space-y-3 px-4 pt-4 pb-6 sm:px-6 lg:px-8">
      <SegmentedControl mode={mode} setMode={setMode} />

      {/* Both workspaces remain mounted; only the active one is visible.
          State, in-progress edits, fingerprint, and PreviewModal stay
          alive in the inactive segment so toggling preserves work. */}
      <div
        id="pricing-panel-range"
        role="tabpanel"
        aria-labelledby="pricing-tab-range"
        className={mode === "range" ? "" : "hidden"}
      >
        <QuoteRangeWorkspace
          quoteRequestId={quoteRequestId}
          miles={miles}
          defaults={rangeDefaults}
          nextLeadId={nextLeadId}
        />
      </div>
      <div
        id="pricing-panel-finalized"
        role="tabpanel"
        aria-labelledby="pricing-tab-finalized"
        className={mode === "finalized" ? "" : "hidden"}
      >
        <FinalizedQuoteWorkspace
          quoteRequestId={quoteRequestId}
          state={finalizedQuoteState}
          nextLeadId={nextLeadId}
        />
      </div>
    </div>
  );
}

function SegmentedControl({
  mode,
  setMode,
}: {
  mode: PricingMode;
  setMode: (next: PricingMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Pricing mode"
      className="grid grid-cols-2 border border-line-strong"
    >
      <SegButton
        id="pricing-tab-range"
        controls="pricing-panel-range"
        active={mode === "range"}
        onClick={() => setMode("range")}
        label="Range quote"
      />
      <SegButton
        id="pricing-tab-finalized"
        controls="pricing-panel-finalized"
        active={mode === "finalized"}
        onClick={() => setMode("finalized")}
        label="Finalized quote"
      />
    </div>
  );
}

function SegButton({
  id,
  controls,
  active,
  onClick,
  label,
}: {
  id: string;
  controls: string;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={
        // 6.9C: admin segmented-control. Solid black active (no white
        // inset — that customer-page CTA pattern is gone from admin).
        // White inactive with sand hover.
        "px-2 py-2.5 text-center font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] transition-colors focus:outline-none sm:text-[11px] " +
        (active
          ? "bg-canvas text-fg"
          : "bg-card text-fg hover:bg-elevated")
      }
    >
      {label}
    </button>
  );
}
