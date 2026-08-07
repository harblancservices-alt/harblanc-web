const STAGES = ["Pickup", "Loaded", "Transit", "Delivered", "Paid"] as const;
const LAST = STAGES.length - 1;

/** Shipment timeline — the piece of legacy's Load Board Brent explicitly
 * loves (src/app/admin/(authed)/dispatch/loads/board/LoadCard.tsx's
 * Timeline). Ported to v2 tokens: green-checked done steps, an
 * accent-highlighted current step, grey upcoming steps, and a uniformly
 * greyed-out track for a TONU'd load (no false "Pickup" checkmark — the
 * whole tracker just goes flat, matching legacy's `cancelled` override).
 *
 * "Invoice" was dropped per Brent's correction — 5 steps now, ending at
 * "Paid" instead of 6. The last step ("Paid") carries the outstanding-vs-
 * settled distinction that used to live on "Invoice": once a load reaches
 * it, it renders RED (not the normal accent "current" color) while
 * `paid` is false — the one thing still owed — and flips to the same
 * green checkmark every earlier done step gets once `paid` is true. */
export function LoadTimeline({ stage, cancelled, paid }: { stage: number; cancelled: boolean; paid: boolean }) {
  const drawn = cancelled ? -1 : stage;

  return (
    <div className="flex items-start">
      {STAGES.map((label, i) => {
        const isLast = i === LAST;
        const reachedLast = !cancelled && isLast && i === drawn;
        const done = !cancelled && (i < drawn || (reachedLast && paid));
        const outstanding = reachedLast && !paid;
        const current = !cancelled && i === drawn && !done && !outstanding;
        const before = !cancelled && i <= drawn;
        const after = !cancelled && i < drawn;

        return (
          <div key={label} className={`flex flex-col items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? "invisible" : before ? "bg-ok" : "bg-line"}`} />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? "bg-ok text-white"
                    : outstanding
                      ? "bg-bad text-white ring-4 ring-bad/20"
                      : current
                        ? "bg-accent text-white ring-4 ring-accent/20"
                        : "bg-elevated text-fg-subtle"
                }`}
                aria-hidden
              >
                {done ? "✓" : i + 1}
              </span>
              <div className={`h-0.5 flex-1 ${isLast ? "invisible" : after ? "bg-ok" : "bg-line"}`} />
            </div>
            <span
              className={`mt-1 text-center text-[10px] leading-tight ${
                outstanding ? "font-semibold text-bad" : current ? "font-semibold text-fg" : "text-fg-subtle"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
