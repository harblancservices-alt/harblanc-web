"use client";

import { useMemo } from "react";
import { parseServerTimestamp, centralDayRange } from "../../../_shell/format";
import { LocalTime } from "../../../_shell/LocalTime";
import { ZEBRA_ROWS } from "../../../_shell/ui";

const CENTRAL_TZ = "America/Chicago";

export type ActivityEvent = {
  id: string;
  kind: string;
  label: string | null;
  path: string | null;
  createdAt: string;
};

function centralDayKey(d: Date): string {
  // en-CA renders as YYYY-MM-DD — a stable, sortable Central calendar-day key.
  return d.toLocaleDateString("en-CA", { timeZone: CENTRAL_TZ });
}

function dayHeading(d: Date): string {
  const diffDays = Math.round(
    (centralDayRange().startMs - centralDayRange(d).startMs) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    timeZone: CENTRAL_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The activity list's day-grouping + rendering, entirely client-side (the
 * page above only owns the empty state — presence/absence of events is
 * knowable server-side). "Today" and each day boundary are always the
 * CENTRAL calendar day, matching every other date/time in the CRM, not the
 * viewer's own browser zone.
 */
export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  const groups = useMemo(() => {
    const list: { key: string; heading: string; items: ActivityEvent[] }[] = [];
    for (const e of events) {
      const d = parseServerTimestamp(e.createdAt);
      const key = d ? centralDayKey(d) : "unknown";
      const heading = d ? dayHeading(d) : "Unknown date";
      const last = list[list.length - 1];
      if (last && last.key === key) last.items.push(e);
      else list.push({ key, heading, items: [e] });
    }
    return list;
  }, [events]);

  return (
    <div className="divide-y divide-line-strong">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="bg-inset px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
            {g.heading}
          </p>
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {g.items.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {e.kind === "login" ? (
                      <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                        Login
                      </span>
                    ) : (
                      <span className="bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                        {e.kind === "action" ? "Action" : "Page"}
                      </span>
                    )}
                    <span className="truncate text-[13.5px] font-medium text-fg">
                      {e.label || "—"}
                    </span>
                  </div>
                  {e.path && (
                    <p className="mt-0.5 truncate font-mono text-[11.5px] text-fg-subtle">
                      {e.path}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[12px] text-fg-subtle">
                  <LocalTime iso={e.createdAt} options={{ hour: "numeric", minute: "2-digit" }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
