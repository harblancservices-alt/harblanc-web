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
 *   done    — black filled square with white "✓"  (the freight already
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
  /** Any bills_of_lading row has been sent (sent_at non-null). */
  bolSent: boolean;
};

type StageId =
  | "range"
  | "intake"
  | "finalized"
  | "confirmed"
  | "bol"
  | "ready";

type StageState = "done" | "active" | "pending";

type Stage = {
  id: StageId;
  /** Two-digit ordinal — freight document feel. */
  ordinal: string;
  /** Short label (mono uppercase). */
  label: string;
};

const STAGES: ReadonlyArray<Stage> = [
  { id: "range", ordinal: "01", label: "Range" },
  { id: "intake", ordinal: "02", label: "Intake" },
  { id: "finalized", ordinal: "03", label: "Finalized" },
  { id: "confirmed", ordinal: "04", label: "Confirmed" },
  { id: "bol", ordinal: "05", label: "BOL" },
  { id: "ready", ordinal: "06", label: "Ready" },
];

/**
 * Map artifact state to the per-stage completion. A stage is `done`
 * when its underlying artifact exists; the FIRST stage that is not
 * done becomes `active`; subsequent stages stay `pending`. If every
 * stage is done, the last one renders as `active` (Ready for dispatch
 * is the highest operational state this strip surfaces).
 */
function computeStageStates(
  input: DispatchStageInput,
): Record<StageId, StageState> {
  const doneMap: Record<StageId, boolean> = {
    range: input.estimateSent,
    intake: input.intakeSubmitted,
    finalized: input.finalizedQuoteSent,
    confirmed: input.finalizedQuoteConfirmed,
    bol: input.bolGenerated,
    // Ready = confirmed AND BOL exists. This is the operational
    // handoff moment: the rate is locked and the paperwork is in
    // dispatch's hands.
    ready: input.finalizedQuoteConfirmed && input.bolGenerated,
  };

  const result: Record<StageId, StageState> = {
    range: "pending",
    intake: "pending",
    finalized: "pending",
    confirmed: "pending",
    bol: "pending",
    ready: "pending",
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

  // Edge case: every stage is done. Mark the final one as active so the
  // strip always carries a current marker (Ready never becomes "stale").
  if (!foundActive) {
    result.ready = "active";
  }

  return result;
}

// Human-readable headline derived from the state map — sits to the
// right of the strip on desktop, above it on mobile. Single sentence
// answering "what's the next operational move?"
function headlineFromStates(
  states: Record<StageId, StageState>,
): string {
  if (states.ready === "active") {
    return "Ready for dispatch — paperwork in hand, rate locked.";
  }
  if (states.ready === "done") {
    return "Dispatched and in motion.";
  }
  if (states.bol === "active") {
    return "Awaiting BOL generation.";
  }
  if (states.confirmed === "active") {
    return "Awaiting customer confirmation of the finalized rate.";
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
      className="border border-black border-l-4 border-l-red-700 bg-[#f3f1e9]"
    >
      {/* Title + inline headline (desktop) / wraps to its own line (mobile) */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-2.5 pb-2 sm:px-5">
        <span
          aria-hidden
          className="inline-block h-3.5 w-1 shrink-0 self-center bg-red-700"
        />
        <p className="font-mono text-[12px] font-bold uppercase tracking-[0.2em] text-black">
          Dispatch lifecycle
        </p>
        <span aria-hidden className="hidden h-3 w-px self-center bg-zinc-400 sm:inline-block" />
        <p className="text-[13px] text-black sm:text-[14px]">{headline}</p>
      </div>

      {/* Manifest strip — single bordered grid, 6 cells, no inter-arrow noise */}
      <div className="mx-4 mb-3 grid grid-cols-2 border border-black bg-white sm:mx-5 sm:mb-4 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((stage, idx) => {
          const s = stageStates[stage.id];
          const isLastCol = (idx + 1) % 6 === 0;
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
    (isLastCol ? "" : " lg:border-r lg:border-black") +
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
      <div className={base + " bg-white text-black"}>
        <p className="text-[11px] tracking-[0.18em] text-black">
          {ordinal}
        </p>
        <p className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.1em]">
          {label}
        </p>
        <p className="mt-0.5 text-[11px] tracking-[0.18em] text-black">
          DONE
        </p>
      </div>
    );
  }
  return (
    <div className={base + " bg-white text-black"}>
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
