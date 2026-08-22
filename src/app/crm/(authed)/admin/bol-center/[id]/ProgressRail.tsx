import type { BolStatus } from "../actions";

/**
 * The four real stages this BOL passes through — purely derived from
 * bol.status (no extra data). "Ready" only lights up once
 * recomputeReadyStatus (actions.ts) has actually flipped the status, i.e.
 * shipper + consignee are both resolved; "Sent" lights up once an admin
 * clicks Mark Processed. `ignored` is shown as its own muted state rather
 * than forced into one of the four steps.
 */
const STEPS = ["Extracted", "Needs a decision", "Ready", "Sent"] as const;

function stepIndexForStatus(status: BolStatus): number {
  if (status === "processed") return 3;
  if (status === "ready") return 2;
  return 1; // new | needs_review
}

export function ProgressRail({ status }: { status: BolStatus }) {
  if (status === "ignored") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-card px-4 py-2.5 shadow-e2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-fg-subtle" />
        <p className="text-[12.5px] font-semibold text-fg-muted">Ignored — won&rsquo;t be worked. Reopen to resume the review.</p>
      </div>
    );
  }

  const currentIndex = stepIndexForStatus(status);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-line-strong bg-card px-4 py-3 shadow-e2 sm:gap-2">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < currentIndex || (stepNum === currentIndex && status === "processed");
        const current = stepNum === currentIndex && status !== "processed";
        return (
          <div key={label} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done ? "bg-ok text-white" : current ? "bg-accent text-white" : "bg-inset text-fg-subtle"
                }`}
              >
                {done ? "✓" : stepNum}
              </span>
              <span className={`whitespace-nowrap text-[11.5px] font-semibold ${done || current ? "text-fg" : "text-fg-subtle"}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <span className={`mx-1 h-px flex-1 ${done ? "bg-ok" : "bg-line"}`} />}
          </div>
        );
      })}
    </div>
  );
}
