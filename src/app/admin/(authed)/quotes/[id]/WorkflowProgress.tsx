import type { LeadStatus } from "@/lib/dispatch/status";

/**
 * Workflow progress strip — quote/load detail pipeline visualization.
 *
 * Dark variant — sits inside the V2 Load workspace header on the dark
 * page surface. Renders the 10-step lifecycle a load passes through:
 *
 *   New → Reviewed → Quoted → Accepted → Scheduled → At pickup →
 *   In transit → Delivered → Invoiced → Paid/Archived
 *
 * Mapped from the existing 13-state `LeadStatus` enum. The "Invoiced"
 * step has no DB state today — it renders as DISABLED (dashed dot,
 * muted label) rather than faked. Dashed dot is the only signal; no
 * subtitle text.
 *
 * `lost` lead status takes the pipeline off the rails — we replace
 * the full strip with a single "Cancelled" line.
 *
 * Visual states:
 *   - past     = filled zinc-200 dot, zinc-200 label
 *   - current  = filled red-500 dot with subtle red ring, red-300 label
 *   - future   = outlined zinc-700 dot, zinc-500 label
 *   - disabled = dashed zinc-700 dot, zinc-600 label
 */

type StepState = "past" | "current" | "future" | "disabled";

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
  { key: "closed", label: "Paid / Archived", match: ["archived"] },
];

function findCurrentStepIndex(status: LeadStatus): number {
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i]!.match.includes(status)) return i;
  }
  return -1;
}

export function WorkflowProgress({
  currentStatus,
}: {
  currentStatus: LeadStatus;
}) {
  if (currentStatus === "lost") {
    return (
      <div
        aria-label="Workflow"
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2"
      >
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-500">
          Workflow
        </p>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-300">
          Cancelled · Off the pipeline
        </p>
      </div>
    );
  }

  const currentIndex = findCurrentStepIndex(currentStatus);

  return (
    <div
      aria-label="Workflow"
      className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2"
    >
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-500">
        Workflow
      </p>
      <div className="-mx-1 mt-2 overflow-x-auto">
        <ol className="flex min-w-max items-start gap-0 pb-1">
          {STEPS.map((step, i) => {
            const state = stateFor(step, i, currentIndex);
            const isLast = i === STEPS.length - 1;
            return (
              <li
                key={step.key}
                className="flex shrink-0 items-start"
                aria-current={state === "current" ? "step" : undefined}
              >
                <div className="flex flex-col items-center px-1.5 text-center">
                  <StepDot state={state} />
                  <span className={labelClass(state)}>{step.label}</span>
                </div>
                {!isLast ? <Connector state={state} /> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function stateFor(step: Step, i: number, currentIndex: number): StepState {
  if (step.disabled) return "disabled";
  if (currentIndex === -1) return "future";
  if (i < currentIndex) return "past";
  if (i === currentIndex) return "current";
  return "future";
}

function StepDot({ state }: { state: StepState }) {
  const inner = (() => {
    switch (state) {
      case "past":
        return "h-[10px] w-[10px] rounded-full bg-zinc-200";
      case "current":
        return "h-[12px] w-[12px] rounded-full bg-red-500 ring-2 ring-red-900";
      case "future":
        return "h-[10px] w-[10px] rounded-full border-2 border-zinc-700 bg-zinc-950";
      case "disabled":
        return "h-[10px] w-[10px] rounded-full border-2 border-dashed border-zinc-700 bg-zinc-950";
    }
  })();
  return <span aria-hidden className={"block " + inner} />;
}

function labelClass(state: StepState): string {
  const base =
    "mt-1.5 block whitespace-nowrap font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] ";
  switch (state) {
    case "past":
      return base + "text-zinc-200";
    case "current":
      return base + "text-red-300";
    case "future":
      return base + "text-zinc-500";
    case "disabled":
      return base + "text-zinc-600";
  }
}

function Connector({ state }: { state: StepState }) {
  const after = state === "past" || state === "current";
  return (
    <span
      aria-hidden
      className={
        "mt-[5px] h-[2px] w-6 self-start sm:w-9 " +
        (after ? "bg-zinc-300" : "bg-zinc-800")
      }
    />
  );
}
