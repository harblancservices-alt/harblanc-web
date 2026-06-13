/**
 * BolBlockerCard — prominent amber blocker card surfaced above the
 * Documents card when a BOL is required next.
 *
 * Phases mapped from the existing BolState:
 *   - no_sent_finalized_quote → "BOL blocked" (gated on finalized quote)
 *   - ready_to_generate       → "BOL required"
 *   - draft                   → "BOL draft in progress" (lower urgency)
 *   - sent                    → returns null (no blocker)
 *
 * Pure presentation. Does not call any server actions itself — the
 * "Draft now" link points to the existing #documents anchor so the
 * operator lands in the section that owns the BolWorkspace.
 */

export type BolBlockerPhase =
  | "no_sent_finalized_quote"
  | "ready_to_generate"
  | "draft"
  | "sent";

export function BolBlockerCard({ phase }: { phase: BolBlockerPhase }) {
  if (phase === "sent") return null;

  const { headline, body, ctaLabel } = (() => {
    switch (phase) {
      case "no_sent_finalized_quote":
        return {
          headline: "BOL blocked",
          body: "Send a finalized quote first — the BOL composer needs that to draft.",
          ctaLabel: "Open documents →",
        };
      case "ready_to_generate":
        return {
          headline: "BOL required",
          body: "Customer has accepted. Draft the BOL to keep this load moving.",
          ctaLabel: "Draft now →",
        };
      case "draft":
        return {
          headline: "BOL in draft",
          body: "A draft is in progress — review and send to the customer.",
          ctaLabel: "Open draft →",
        };
    }
  })();

  return (
    <section
      role="alert"
      aria-label="BOL status"
      className="rounded-md border border-amber-700/70 border-l-[4px] border-l-amber-500 bg-amber-950/20 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle />
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.22em] text-amber-300">
          {headline}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-amber-100/80">
        {body}
      </p>
      <a
        href="#workspace-documents"
        className="mt-1.5 inline-block font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-amber-300 transition-colors hover:text-amber-200"
      >
        {ctaLabel}
      </a>
    </section>
  );
}

function AlertTriangle() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-amber-400"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
