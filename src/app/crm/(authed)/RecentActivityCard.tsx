import Link from "next/link";
import { Card, CardHead } from "./_shell/ui";
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
 */
export function RecentActivityCard({ items }: { items: RecentActivityItem[] }) {
  return (
    <Card>
      <CardHead title="Recent activity" hint={items.length ? `${items.length} latest` : undefined} />
      {items.length === 0 ? (
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
      )}
    </Card>
  );
}
