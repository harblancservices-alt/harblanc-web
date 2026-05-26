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
      className="rounded border border-zinc-300 bg-white"
    >
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        {/* Headline — what the operator should do or expect next */}
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="inline-block h-3.5 w-1 shrink-0 bg-red-600" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">
            Dispatch lifecycle
          </p>
          <span aria-hidden className="hidden h-3 w-px bg-zinc-300 lg:inline-block" />
          <p className="hidden text-sm text-black lg:inline">{headline}</p>
        </div>

        {/* Step strip */}
        <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-2 sm:gap-x-3">
          {STAGES.map((stage, idx) => {
            const s = stageStates[stage.id];
            const isLast = idx === STAGES.length - 1;
            return (
              <li
                key={stage.id}
                className="flex items-center gap-2 sm:gap-2.5"
                aria-current={s === "active" ? "step" : undefined}
              >
                <StageCell ordinal={stage.ordinal} state={s} />
                <span
                  className={
                    "font-mono text-[10px] font-bold uppercase tracking-[0.14em] " +
                    (s === "done"
                      ? "text-black"
                      : s === "active"
                        ? "text-red-700"
                        : "text-zinc-500")
                  }
                >
                  {stage.label}
                </span>
                {!isLast ? (
                  <span
                    aria-hidden
                    className="hidden h-px w-3 bg-zinc-300 sm:inline-block sm:w-4"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Mobile-only headline — shows below the strip when the desktop
          inline version is hidden. */}
      <p className="border-t border-zinc-200 px-4 py-2 text-sm text-black sm:px-5 lg:hidden">
        {headline}
      </p>
    </section>
  );
}

function StageCell({
  ordinal,
  state,
}: {
  ordinal: string;
  state: StageState;
}) {
  if (state === "done") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center border border-black bg-black font-mono text-[10px] font-bold text-white"
      >
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center border border-red-600 bg-white font-mono text-[10px] font-bold tabular-nums text-red-700"
      >
        {ordinal}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 items-center justify-center border border-zinc-300 bg-white font-mono text-[10px] font-bold tabular-nums text-zinc-500"
    >
      {ordinal}
    </span>
  );
}
