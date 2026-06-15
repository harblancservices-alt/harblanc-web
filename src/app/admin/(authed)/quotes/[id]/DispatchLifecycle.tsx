/**
 * Phase 3B — operational dispatch lifecycle strip.
 *
 * Aggregates existing artifact state (estimate sent, intake submitted,
 * finalized quote sent + confirmed, BOL generated) into a single
 * horizontal step indicator at the top of the quote-detail workspace.
 * Pure presentation — derives stages from data the parent page already
 * loaded. No new queries, no new lead_status values, no migrations.
 *
 * The strip surfaces the operational moment of "READY FOR DISPATCH" so
 * dispatch never wonders whether the FQ was confirmed or whether the
 * BOL has been generated. Sales/intake work ends at the Confirmed
 * stage; dispatch execution begins at Ready.
 *
 * Future-ready: stages 7-9 (Dispatched / In transit / Delivered)
 * already exist in the LeadStatus enum (see src/lib/dispatch/status.ts)
 * but are intentionally NOT included here because there's no
 * artifact-state derivation for them yet. They can be appended later
 * when a driver-assignment layer lands.
 *
 * No-emoji, no-icons, no-animation — industrial mono-uppercase
 * operational marker. Each stage renders as a numbered cell with one
 * of three states:
 *   done    — black filled square with white check (the freight already
 *             passed this stage)
 *   active  — red-bordered square with red number (the current
 *             operational stage)
 *   pending — neutral outlined square with zinc number (not yet
 *             reached)
 *
 * Mobile: the strip wraps as needed; on narrow widths the connecting
 * arrows hide so each stage stacks cleanly.
 */

export type DispatchStageInput = {
  /** Estimate has been sent at least once (range proposal in customer's inbox). */
  estimateSent: boolean;
  /** shipment_intake.status === "submitted" — customer filled and submitted the intake form. */
  intakeSubmitted: boolean;
  /** A finalized_quotes row exists with non-null sent_at. */
  finalizedQuoteSent: boolean;
  /** finalized_quotes.confirmed_at is non-null on the latest sent row. */
  finalizedQuoteConfirmed: boolean;
  /** Any bills_of_lading row exists (draft or sent). */
  bolGenerated: boolean;
};

export type StageId =
  | "range"
  | "intake"
  | "finalized"
  | "confirmed"
  | "bol";

export type StageState = "done" | "active" | "pending";

export type Stage = {
  id: StageId;
  /** Two-digit ordinal — freight document feel. */
  ordinal: string;
  /** Short label (mono uppercase). */
  label: string;
};

export const STAGES: ReadonlyArray<Stage> = [
  { id: "range", ordinal: "01", label: "Quote Range" },
  { id: "intake", ordinal: "02", label: "Info Intake" },
  { id: "finalized", ordinal: "03", label: "Finalize" },
  { id: "confirmed", ordinal: "04", label: "Payment Confirmed" },
  { id: "bol", ordinal: "05", label: "BOL Created" },
];

/**
 * Map artifact state to the per-stage completion. A stage is `done`
 * when its underlying artifact exists; the FIRST stage that is not
 * done becomes `active`; subsequent stages stay `pending`. If every
 * stage is done, the last one renders as `active` so the strip always
 * carries a current marker (BOL Created never becomes "stale").
 */
export function computeStageStates(
  input: DispatchStageInput,
): Record<StageId, StageState> {
  const doneMap: Record<StageId, boolean> = {
    range: input.estimateSent,
    intake: input.intakeSubmitted,
    finalized: input.finalizedQuoteSent,
    confirmed: input.finalizedQuoteConfirmed,
    bol: input.bolGenerated,
  };

  const result: Record<StageId, StageState> = {
    range: "pending",
    intake: "pending",
    finalized: "pending",
    confirmed: "pending",
    bol: "pending",
  };

  let foundActive = false;
  for (const stage of STAGES) {
    if (doneMap[stage.id]) {
      result[stage.id] = "done";
    } else if (!foundActive) {
      result[stage.id] = "active";
      foundActive = true;
    }
  }

  // Edge case: every stage is done. Mark the final one (BOL Created) as
  // active so the strip always carries a current marker.
  if (!foundActive) {
    result.bol = "active";
  }

  return result;
}

// Human-readable headline derived from the state map — sits to the
// right of the strip on desktop, above it on mobile. Single sentence
// answering "what's the next operational move?"
export function headlineFromStates(
  states: Record<StageId, StageState>,
): string {
  if (states.bol === "done") {
    return "BOL in hand — lifecycle complete.";
  }
  if (states.bol === "active") {
    return "Awaiting BOL generation.";
  }
  if (states.confirmed === "active") {
    return "Awaiting payment confirmation.";
  }
  if (states.finalized === "active") {
    return "Ready to send the finalized quote.";
  }
  if (states.intake === "active") {
    return "Awaiting customer intake submission.";
  }
  if (states.range === "active") {
    return "Send the range proposal to begin the lifecycle.";
  }
  return "Lifecycle complete.";
}

/**
 * Resolve the single current stage label for display in compact
 * surfaces (e.g. Overview tab "Stage: Intake"). Internally calls
 * computeStageStates() so this helper and the full 6-cell pipeline
 * (rendered by <DispatchLifecycle> and later TimelineTab) cannot
 * drift - both consumers derive from a single source of truth.
 *
 * Returns the active stage's label. If every stage is done, returns
 * the last stage's label (matches the "ready never becomes stale"
 * edge case in computeStageStates).
 */
export function currentStageLabel(state: DispatchStageInput): string {
  const states = computeStageStates(state);
  const active = STAGES.find((s) => states[s.id] === "active");
  return active?.label ?? STAGES[STAGES.length - 1].label;
}

export function DispatchLifecycle({
  state,
}: {
  state: DispatchStageInput;
}) {
  const stageStates = computeStageStates(state);
  const headline = headlineFromStates(stageStates);

  return (
    <section
      aria-label="Dispatch lifecycle"
      className="border-2 border-line border-l-4 border-l-black bg-[#f3f1e9]"
    >
      {/* Title + inline headline (desktop) / wraps to its own line (mobile) */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-2.5 pb-2 sm:px-5">
        <span
          aria-hidden
          className="inline-block h-3.5 w-1 shrink-0 self-center bg-canvas"
        />
        <p className="font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-fg">
          Dispatch lifecycle
        </p>
        <span aria-hidden className="hidden h-3 w-px self-center bg-zinc-400 sm:inline-block" />
        <p className="text-[13px] text-fg sm:text-[14px]">{headline}</p>
      </div>

      {/* Manifest strip - single bordered grid, 5 cells, no inter-arrow noise */}
      <div className="mx-4 mb-3 grid grid-cols-2 border border-line bg-card sm:mx-5 sm:mb-4 sm:grid-cols-3 lg:grid-cols-5">
        {STAGES.map((stage, idx) => {
          const s = stageStates[stage.id];
          const isLastCol = (idx + 1) % 5 === 0;
          const onSmRightEdge = (idx + 1) % 2 === 0;
          return (
            <StageCell
              key={stage.id}
              ordinal={stage.ordinal}
              label={stage.label}
              state={s}
              isLastCol={isLastCol}
              isSmRightEdge={onSmRightEdge}
            />
          );
        })}
      </div>
    </section>
  );
}

function StageCell({
  ordinal,
  label,
  state,
  isLastCol,
  isSmRightEdge,
}: {
  ordinal: string;
  label: string;
  state: StageState;
  isLastCol: boolean;
  isSmRightEdge: boolean;
}) {
  // Right-edge border control so vertical rules between cells render
  // crisply on every breakpoint without doubling up on the outer frame.
  const rightBorder =
    " border-b border-zinc-300 lg:border-b-0" +
    (isLastCol ? "" : " lg:border-r lg:border-line") +
    (isSmRightEdge ? "" : " sm:border-r sm:border-zinc-300");

  const base =
    "px-2 py-2 text-center font-mono" + rightBorder;

  if (state === "active") {
    return (
      <div className={base + " bg-red-700 text-white"}>
        <p className="text-[11px] tracking-[0.18em] opacity-90">
          {ordinal}
        </p>
        <p className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.1em]">
          {label}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.18em] opacity-85">
          CURRENT
        </p>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className={base + " bg-card text-fg"}>
        <p className="text-[11px] tracking-[0.18em] text-fg">
          {ordinal}
        </p>
        <p className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.1em]">
          {label}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.18em] text-fg">
          DONE
        </p>
      </div>
    );
  }
  return (
    <div className={base + " bg-card text-fg"}>
      <p className="text-[11px] tracking-[0.18em]">
        {ordinal}
      </p>
      <p className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.1em]">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] tracking-[0.18em]">
        PENDING
      </p>
    </div>
  );
}
