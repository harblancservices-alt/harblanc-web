"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Card, CardHead } from "../_shell/ui";
import { formatRelativeTime } from "../_shell/format";
import { ACTIVITY_CATEGORIES, ACTIVITY_STYLE, type ActivityCategory } from "./activityTypes";
import type { ActivityFeedItem, ActivityMetrics, AgentOption, ActivityRange } from "./activity-data";

/**
 * THE ACTIVITY DASHBOARD — built for the question "what did this rep
 * actually do", not for browsing history.
 *
 * Every filter is a URL parameter, so the server does the work: changing the
 * agent, the type or the date range is a navigation, the page re-queries
 * with the new bounds, and a filtered view is a link somebody can send.
 * Nothing here holds a copy of the feed.
 *
 * The three-colour rule of the composer is untouched: type badges are
 * TINTED pills, never fills, so an activity type can never be mistaken for
 * a control. See activityTypes.ts.
 */

const RANGES: { key: ActivityRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

function centralTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  });
}
function centralDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago",
  });
}
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/**
 * THE TIME BUBBLE — clock time and how long ago, in one chip.
 *
 * OUTLINED, NOT FILLED, and deliberately so. Every fill on this row already
 * means something: the type badge's tint is the taxonomy, and it is the
 * thing a manager is meant to recognise at a glance. A filled time pill
 * would be the loudest element on the row and would compete with it for
 * exactly the attention the type badge needs. A hairline border in the
 * shared line token reads as a container without claiming a colour, and
 * adds no new colour to the palette.
 *
 * `now` is the SERVER clock, threaded down as a prop. Calling Date.now()
 * here would be a render-time impurity the React Compiler is entitled to
 * cache or replay, and a stale "2h ago" on an accountability page is worse
 * than no stamp at all.
 *
 * Sized to sit INSIDE the existing 18.3px meta line box (14px line + 2 x 1px
 * border = 16px), so the bubble costs the row no height at all.
 */
function TimeBubble({ iso, nowMs }: { iso: string; nowMs: number }) {
  const clock = centralTime(iso);
  const stamp = formatRelativeTime(iso, new Date(nowMs));
  // Past a month the shared helper stops being relative and returns a real
  // date. That date is already the group header two lines up, so repeating
  // it inside the bubble spends width on nothing. Anything genuinely
  // relative — "Just now" through "4w ago" — earns its place.
  const relative = stamp === "Just now" || stamp.endsWith("ago") ? stamp : null;
  return (
    <span
      className="crm-num ml-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong px-1.5 align-middle text-[10.5px] leading-[14px] text-fg-subtle"
      title={`${clock} Central`}
    >
      <span className="text-fg-muted">{clock}</span>
      {relative && <span>{relative}</span>}
    </span>
  );
}

/** Today / Yesterday / the date — the grouping a manager scans by. */
function groupLabel(iso: string, nowMs: number): string {
  const k = dayKey(iso);
  const today = new Date(nowMs).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const yesterday = new Date(nowMs - 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/Chicago",
  });
  if (k === today) return "Today";
  if (k === yesterday) return "Yesterday";
  return centralDay(iso);
}

export function ActivityDashboard({
  items, metrics, agents, hasMore, rangeLabel, failed, nowMs,
  agentId, category, range, from, to, page,
}: {
  items: ActivityFeedItem[];
  metrics: ActivityMetrics;
  agents: AgentOption[];
  hasMore: boolean;
  rangeLabel: string;
  failed: boolean;
  nowMs: number;
  agentId: string | null;
  category: ActivityCategory | null;
  range: ActivityRange;
  from: string | null;
  to: string | null;
  page: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    // Any filter change restarts paging — page 3 of a different question is
    // not a meaningful place to be.
    if (!("page" in next)) p.delete("page");
    startTransition(() => router.push(`${pathname}?${p.toString()}`));
  }

  const agentName = agentId ? agents.find((a) => a.id === agentId)?.name ?? "Unknown" : null;

  /* Every tile carries its definition, from ACTIVITY_STYLE, so the words
     under the number cannot drift from the label above it. */
  const TILES: {
    key: ActivityCategory | "total";
    label: string;
    definition: string;
    value: number;
    tone: string;
  }[] = [
    {
      key: "total",
      label: "Total activities",
      definition: "every tile beside this, added up",
      value: metrics.total,
      tone: "bg-fg text-white",
    },
    ...ACTIVITY_CATEGORIES.filter((c) => c !== "other").map((c) => ({
      key: c,
      label: ACTIVITY_STYLE[c].label,
      definition: ACTIVITY_STYLE[c].definition,
      value: metrics.byCategory[c],
      tone: ACTIVITY_STYLE[c].tone,
    })),
  ];

  const groups: { label: string; rows: ActivityFeedItem[] }[] = [];
  for (const item of items) {
    const label = groupLabel(item.occurredAt, nowMs);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(item);
    else groups.push({ label, rows: [item] });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── WHO ──────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Activity" hint={`${rangeLabel}${agentName ? ` · ${agentName}` : " · all agents"}`} />
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          <button
            type="button"
            onClick={() => setParam({ agent: null })}
            className={`min-h-9 rounded-md px-3 text-[12.5px] font-bold transition-colors ${
              agentId === null ? "bg-fg text-white" : "bg-inset text-fg-muted hover:bg-elevated"
            }`}
          >
            All agents
          </button>
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setParam({ agent: a.id })}
              className={`min-h-9 rounded-md px-3 text-[12.5px] font-bold transition-colors ${
                agentId === a.id ? "bg-fg text-white" : "bg-inset text-fg-muted hover:bg-elevated"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {/* ── WHEN ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setParam({ range: r.key })}
              className={`min-h-8 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                range === r.key ? "bg-accent text-white" : "bg-card text-fg-muted hover:bg-inset"
              }`}
            >
              {r.label}
            </button>
          ))}
          {range === "custom" && (
            <span className="flex items-center gap-1.5">
              <input
                type="date" value={from ?? ""} aria-label="From"
                onChange={(e) => setParam({ range: "custom", from: e.target.value })}
                className="rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] text-fg outline-none focus:border-accent"
              />
              <span className="text-[12px] text-fg-subtle">to</span>
              <input
                type="date" value={to ?? ""} aria-label="To"
                onChange={(e) => setParam({ range: "custom", to: e.target.value })}
                className="rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] text-fg outline-none focus:border-accent"
              />
            </span>
          )}
        </div>

        {/* ── METRICS ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
          {TILES.map((t) => {
            const active = t.key !== "total" && category === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setParam({ type: t.key === "total" ? null : active ? null : String(t.key) })}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  active ? "border-accent bg-accent-bg" : "border-line bg-card hover:border-line-strong"
                }`}
              >
                <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${t.tone}`}>
                  {t.label}
                </span>
                <p className="crm-num mt-1.5 text-[22px] font-extrabold leading-none tracking-[-0.02em] text-fg">
                  {t.value}
                </p>
                {/* ALWAYS VISIBLE, never a tooltip. This dashboard is read
                    on a phone, where hover does not exist, and a `title`
                    cannot be discovered by somebody who does not already
                    know to look for it. One line, 10.5px, so the tile grows
                    by about a dozen pixels rather than becoming a card. */}
                <p className="mt-1 text-[10.5px] leading-[1.25] text-fg-subtle">{t.definition}</p>
              </button>
            );
          })}
        </div>

        {/* Calls are the headline metric, so the two things a total cannot
            say — how many different companies and people were reached — are
            stated beside it rather than left to be worked out. */}
        {metrics.byCategory.call > 0 && (
          <p className="border-t border-line px-3 py-2 text-[12px] text-fg-muted">
            <span className="font-bold text-fg">{metrics.byCategory.call}</span> calls
            {metrics.uniqueCompaniesCalled === null || metrics.uniqueContactsCalled === null ? (
              // Too many calls in the period to dedupe reliably. Say so
              // rather than print a number that is quietly short.
              <> · too many to count reach across this period</>
            ) : (
              <>
                {" "}
                reached{" "}
                <span className="font-bold text-fg">{metrics.uniqueCompaniesCalled}</span>{" "}
                {/* "DIFFERENT" IS THE LOAD-BEARING WORD and the reason this
                    line was rewritten. Brent read "Companies 9" beside
                    "Companies called 15" and could not tell what was what.
                    These two are a count of COMPANIES; the tile above is a
                    count of EVENTS. Saying "different" makes the unit
                    explicit at the point of reading, rather than leaving it
                    to be inferred from two similar words. */}
                {metrics.uniqueCompaniesCalled === 1 ? "different company" : "different companies"}{" "}
                and{" "}
                <span className="font-bold text-fg">{metrics.uniqueContactsCalled}</span>{" "}
                {metrics.uniqueContactsCalled === 1 ? "different person" : "different people"} —
                calling the same company twice counts once here.
              </>
            )}
          </p>
        )}

        {/* DERIVED vs LOGGED is not a footnote — a manager reading these
            numbers has to know what is not in them. */}
        {metrics.unattributed > 0 && (
          <p className="border-t border-line bg-warn-bg px-3 py-2 text-[12px] text-warn">
            <span className="font-bold">{metrics.unattributed}</span> events in this period have no
            agent recorded — bulk intake and system imports. They are shown in the feed as{" "}
            <span className="font-bold">System</span> and are not counted toward any agent.
          </p>
        )}
      </Card>

      {/* ── THE FEED ───────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title={category ? ACTIVITY_STYLE[category].label : "All activity"}
          hint={
            category
              ? `filtered · ${rangeLabel}`
              : `${metrics.total} ${metrics.total === 1 ? "event" : "events"} · newest first`
          }
          right={
            category ? (
              <button
                type="button"
                onClick={() => setParam({ type: null })}
                className="text-[12px] font-semibold text-accent hover:underline"
              >
                Clear filter
              </button>
            ) : null
          }
        />

        {failed ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-bold text-bad">Activity could not be loaded</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-[12px] text-fg-subtle">
              The query failed, so this is not an empty period — it is an unanswered one. Reload, and
              if it keeps happening the database is the place to look.
            </p>
          </div>
        ) : pending ? (
          <p className="px-4 py-10 text-center text-[13px] text-fg-subtle">Loading activity…</p>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] font-bold text-fg">
              {agentName ? `No activity for ${agentName}` : "No activity"} in this period
            </p>
            <p className="mx-auto mt-1 max-w-[44ch] text-[12px] text-fg-subtle">
              {rangeLabel} is genuinely empty{category ? ` for ${ACTIVITY_STYLE[category].label.toLowerCase()}` : ""}.
              Widen the date range, or clear the filters, to see whether anything happened at all.
            </p>
          </div>
        ) : (
          <div>
            {groups.map((g) => (
              <div key={g.label}>
                <p className="sticky top-0 z-10 border-y border-line bg-inset px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                  {g.label}
                </p>
                {g.rows.map((item) => {
                  const style = ACTIVITY_STYLE[item.category];
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 border-b border-line px-3 py-2 last:border-b-0 hover:bg-inset"
                    >
                      <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${style.tone}`}>
                            {style.badge}
                          </span>
                          <span className="min-w-0 truncate text-[13px] font-bold text-fg">{item.title}</span>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-fg-muted">
                          <span className={item.actorName ? "font-semibold text-fg" : "font-semibold text-fg-subtle"}>
                            {item.actorName ?? "System"}
                          </span>
                          {item.accountName && <> · {item.accountName}</>}
                          {item.contactName && <> · {item.contactName}</>}
                          <TimeBubble iso={item.occurredAt} nowMs={nowMs} />
                        </p>
                        {item.body && (
                          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-fg-subtle">
                            {item.body}
                          </p>
                        )}
                      </div>
                      {item.href ? (
                        <Link
                          href={item.href}
                          prefetch={false}
                          className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-line-strong bg-card px-3 text-[12px] font-bold text-accent transition-colors hover:bg-accent-bg"
                        >
                          View
                        </Link>
                      ) : (
                        <span
                          className="inline-flex min-h-9 shrink-0 items-center px-2 text-[11.5px] text-fg-subtle"
                          title="This event is not attached to a company or a contact"
                        >
                          —
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {(page > 0 || hasMore) && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setParam({ page: String(page - 1) })}
                  className="min-h-9 rounded-md border border-line-strong bg-card px-3 text-[12px] font-bold text-fg transition-colors hover:bg-inset disabled:opacity-40"
                >
                  Newer
                </button>
                <span className="text-[11.5px] text-fg-subtle">Page {page + 1}</span>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => setParam({ page: String(page + 1) })}
                  className="min-h-9 rounded-md border border-line-strong bg-card px-3 text-[12px] font-bold text-fg transition-colors hover:bg-inset disabled:opacity-40"
                >
                  Older
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
