"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "./_shell/ui";
import { IconChevronDown } from "./_shell/icons";
import { formatDateTime } from "./_shell/format";

export type RecentActivityKind = "call" | "note" | "activity";

export type RecentActivityItem = {
  id: string;
  kind: RecentActivityKind;
  accountId: string | null;
  companyName: string | null;
  detail: string;
  occurredAt: string;
  author: string | null;
};

const KIND_TONE: Record<RecentActivityKind, string> = {
  call: "bg-accent",
  note: "bg-warn",
  activity: "bg-slate",
};

/**
 * RECENT ACTIVITY — the latest calls/notes/timeline events across every
 * company, newest first (page.tsx merges crm_calls + crm_notes + a filtered
 * slice of crm_activities and sorts them; this just renders the result).
 * Org-wide for every rep, not owner-gated — unlike the old dashboard's
 * ActivityTimeline, which was a single company's own append-only feed.
 *
 * Collapsed by default at the bottom of the dashboard — it's the lowest-
 * priority section, and rendering the list unconditionally pushed the page's
 * most useful cards (Needs attention, What's next, Pipeline) further down
 * the scroll. A plain client component (no server-passed function prop) so
 * the toggle is just local state, not a `*Dialog` trigger crossing the
 * server/client boundary.
 */
export function RecentActivityCard({ items }: { items: RecentActivityItem[] }) {
  const [open, setOpen] = useState(false);
  const hint = items.length ? `${items.length} latest` : undefined;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-graphite-line bg-bar px-4 py-2.5 text-left transition-colors hover:bg-graphite-line/60"
      >
        <div className="min-w-0">
          <h2 className="truncate text-[13.5px] font-bold tracking-tight text-bar-fg">Recent activity</h2>
          {hint && <p className="truncate text-[11px] font-medium text-bar-fg/70">{hint}</p>}
        </div>
        <IconChevronDown
          width={18}
          height={18}
          className={`shrink-0 text-bar-fg transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open &&
        (items.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
            No recent activity. Calls and notes will show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-0 divide-y divide-line-strong">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 px-5 py-3">
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 ${KIND_TONE[item.kind]}`} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13.5px] text-fg">
                    {item.companyName && item.accountId ? (
                      <Link
                        href={`/crm/accounts/${item.accountId}`}
                        prefetch={false}
                        className="font-semibold text-accent hover:underline"
                      >
                        {item.companyName}
                      </Link>
                    ) : (
                      item.companyName && <span className="font-semibold text-fg">{item.companyName}</span>
                    )}
                    {item.companyName ? " · " : ""}
                    <span className="text-fg-muted">{item.detail}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-fg-subtle">
                    {item.author ? `${item.author} · ` : ""}
                    {formatDateTime(item.occurredAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </Card>
  );
}
