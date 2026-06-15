import type { LeadStatus } from "@/lib/dispatch/status";

/**
 * WorkflowProgressBar — slim 10-segment progress bar for the workflow.
 *
 * Dense variant of WorkflowProgress: ten horizontal bars instead of a
 * step/dot/connector trail. Used directly under the StatusHero so it
 * acts as a quiet progress indicator without competing with the lane
 * and status blocks.
 *
 * Maps the 13-state LeadStatus enum to a 10-step lifecycle:
 *   1 New        →  2 Reviewed   →  3 Quoted     →  4 Accepted
 *   5 Scheduled  →  6 At pickup  →  7 In transit →  8 Delivered
 *   9 Invoiced   → 10 Paid / Archived
 *
 * "Invoiced" has no DB state — it renders disabled (zinc-700) until we
 * add the corresponding lead_status value.
 */

type Step = {
  key: string;
  label: string;
  match: ReadonlyArray<LeadStatus>;
  disabled?: boolean;
};

const STEPS: ReadonlyArray<Step> = [
  { key: "new", label: "New", match: ["new"] },
  { key: "reviewed", label: "Reviewed", match: ["contacted"] },
  { key: "quoted", label: "Quoted", match: ["estimate_sent"] },
  {
    key: "accepted",
    label: "Accepted",
    match: ["awaiting_confirmation", "booked"],
  },
  {
    key: "scheduled",
    label: "Scheduled",
    match: ["awaiting_payment", "ready_to_dispatch"],
  },
  { key: "at_pickup", label: "At pickup", match: ["dispatched"] },
  { key: "in_transit", label: "In transit", match: ["picked_up", "in_transit"] },
  { key: "delivered", label: "Delivered", match: ["delivered"] },
  { key: "invoiced", label: "Invoiced", match: [], disabled: true },
  { key: "closed", label: "Paid", match: ["archived"] },
];

export function WorkflowProgressBar({
  currentStatus,
}: {
  currentStatus: LeadStatus;
}) {
  if (currentStatus === "lost") {
    return (
      <div className="flex items-center justify-between rounded-sm bg-card px-3 py-1.5">
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-fg-subtle">
          Workflow
        </p>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-amber-700">
          Cancelled · Off the pipeline
        </p>
      </div>
    );
  }

  let currentIndex = -1;
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i]!.match.includes(currentStatus)) {
      currentIndex = i;
      break;
    }
  }

  const currentStep = currentIndex >= 0 ? STEPS[currentIndex] : null;
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : null;
  const remaining =
    stepNumber != null ? Math.max(0, STEPS.length - stepNumber) : null;

  return (
    <div aria-label="Workflow">
      <div className="grid grid-cols-10 gap-[3px]">
        {STEPS.map((step, i) => {
          const isPast = currentIndex >= 0 && i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = !step.disabled && !isPast && !isCurrent;
          const cls = step.disabled
            ? "bg-elevated/80"
            : isPast
              ? "bg-emerald-500"
              : isCurrent
                ? "bg-amber-500"
                : "bg-elevated";
          void isFuture;
          return (
            <span
              key={step.key}
              aria-hidden
              className={"block h-[3px] rounded-[1px] xl:h-[4px] " + cls}
            />
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-fg-subtle xl:text-[10.5px]">
        <span>
          {stepNumber != null && currentStep
            ? "Step " + stepNumber + " of " + STEPS.length + " · " + currentStep.label
            : "Step — of " + STEPS.length}
        </span>
        <span>
          {remaining != null
            ? remaining === 1
              ? "1 step remaining"
              : remaining + " steps remaining"
            : ""}
        </span>
      </div>
    </div>
  );
}
