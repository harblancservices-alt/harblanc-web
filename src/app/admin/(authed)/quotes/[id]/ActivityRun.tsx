import { describeEvent, type TimelineEventRow } from "./tabs/TimelineTab";

/**
 * ActivityRun — compact single-line activity readout.
 *
 * Replaces the full EventHistorySection visual treatment with a dense
 * inline run of the most-recent events for the workstation-style
 * bottom card. The full timeline remains reachable from the existing
 * Activity collapsible (toggleable via "View all").
 *
 *   12m  Range proposal sent · 28m  Details edited · 1h  Status →
 *   Review needed · 3h  Intake submitted              View all 12 →
 *
 * Renders nothing when there are no events (the wrapping card hides
 * itself in that case so the workstation surface doesn't get a stub).
 */

export type ActivityRunProps = {
  /** Newest-first. Parent supplies LIMIT 100. */
  events: ReadonlyArray<TimelineEventRow>;
  /** How many of the newest events to inline. Default 4. */
  limit?: number;
};

export function ActivityRun({ events, limit = 4 }: ActivityRunProps) {
  if (events.length === 0) {
    return (
      <p className="px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">
        No activity yet
      </p>
    );
  }
  const slice = events.slice(0, limit);
  return (
    <p className="px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
      {slice.map((event, i) => {
        const rel = relativeShort(event.createdAt);
        const { label } = describeEvent(event.kind, event.payload);
        return (
          <span key={event.id}>
            <span className="font-mono tabular-nums text-zinc-600">{rel}</span>
            <span> {label}</span>
            {i < slice.length - 1 ? (
              <span aria-hidden className="px-1.5 text-zinc-700">
                ·
              </span>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}

/**
 * Tight relative-time formatter — "12m", "1h", "3d", etc. Keeps the
 * inline run scanning fast.
 */
function relativeShort(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const deltaMs = Date.now() - t;
  if (deltaMs < 60_000) return "now";
  const mins = Math.round(deltaMs / 60_000);
  if (mins < 60) return mins + "m";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h";
  const days = Math.round(hrs / 24);
  if (days < 7) return days + "d";
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks + "w";
  const months = Math.round(days / 30);
  return months + "mo";
}
