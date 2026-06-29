import { describeEvent, type TimelineEventRow } from "./tabs/TimelineTab";
import { quoteAgo, quoteClock, quoteDate } from "./quoteTime";

/**
 * ActivityRun — the recent-activity readout for the workstation bottom card.
 *
 * One ROW per event, each showing a consistent "Jun 21 · 18:42 · 1w ago"
 * timestamp (date · time · days-ago) followed by the activity label, e.g.:
 *
 *   Jun 21 · 18:42 · 1w ago    Range proposal sent
 *   Jun 14 · 09:30 · 2w ago    Status changed
 *
 * The full timeline remains reachable from the Activity collapsible. Renders
 * nothing-of-substance when there are no events.
 */

export type ActivityRunProps = {
  /** Newest-first. Parent supplies LIMIT 100. */
  events: ReadonlyArray<TimelineEventRow>;
  /** How many of the newest events to show. Default 4. */
  limit?: number;
};

export function ActivityRun({ events, limit = 4 }: ActivityRunProps) {
  if (events.length === 0) {
    return (
      <p className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">
        No activity yet
      </p>
    );
  }
  const slice = events.slice(0, limit);
  return (
    <ul className="divide-y divide-line/80">
      {slice.map((event) => {
        const { label } = describeEvent(event.kind, event.payload);
        return (
          <li
            key={event.id}
            className="flex items-baseline gap-3 px-3 py-2"
          >
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-subtle">
              {quoteDate(event.createdAt)}
              <span aria-hidden className="px-1 text-fg-subtle/60">
                ·
              </span>
              <span className="font-semibold text-fg">
                {quoteClock(event.createdAt)}
              </span>
              <span aria-hidden className="px-1 text-fg-subtle/60">
                ·
              </span>
              {quoteAgo(event.createdAt)}
            </span>
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg">
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
