/**
 * Level 6.9A — Quote detail hero (V3 pattern).
 *
 * Two-column hero matching the admin design language locked by Active
 * Quotes (6.3), Applications (6.6), and Application Detail (6.7):
 *
 *   LEFT                                   RIGHT
 *   QUOTE                                  ESTIMATE SENT
 *   REQ CEF2ADD5                           RECEIVED 23H AGO
 *
 * - Eyebrow: entity type ("QUOTE"). Mono uppercase, 0.28em tracking.
 * - H1: sans `font-bold tracking-tight`, 30 / 36 / 40 px. No more
 *   `font-mono` H1 — that was the last remaining mono H1 in admin.
 * - Right meta column: mono uppercase. Status label sits on top,
 *   "Received {receivedRelative}" sits below.
 *
 * Pure presentational. No prop changes. No server actions. No DB.
 * Risk: LOW.
 */

export type QuoteHeroProps = {
  identity: {
    /** 8 hex chars from shortRequestId(uuid). */
    requestId: string;
    /** LEAD_STATUS_LABELS[lead_status] — already resolved at the page level.
     *  Surfaced in the right meta column. */
    statusLabel: string;
    /** Optional relative-time string like "3d ago". Already computed at the
     *  page level via relativeTime(row.created_at). Renders in the right
     *  meta column so the dispatcher can see lead age at a glance across
     *  every tab. */
    receivedRelative?: string;
  };
};

export function QuoteHero({ identity }: QuoteHeroProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4 pb-2 sm:px-6 sm:pt-5 sm:pb-2 lg:px-8 lg:pt-6 lg:pb-3">
      <h1
        className="text-[20px] font-bold leading-none tracking-tight text-black sm:text-[22px] lg:text-[24px]"
        aria-label={`Request ${identity.requestId}`}
      >
        REQ {identity.requestId}
      </h1>
      {identity.receivedRelative ? (
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-black text-right leading-snug">
          Received {identity.receivedRelative}
        </p>
      ) : null}
    </header>
  );
}
