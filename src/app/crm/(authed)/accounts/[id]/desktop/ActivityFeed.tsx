import { formatDateTime, formatRelativeTime } from "../../../_shell/format";
import { IconNote, IconPhone, IconTasks } from "../../../_shell/icons";
import type { CrmActivityLogItem } from "../ActivityLogSection";
import { D_MONO } from "./ui";

const TILE: Record<CrmActivityLogItem["type"], string> = {
  call: "bg-accent/10 text-accent",
  note: "bg-warn-bg text-warn",
  activity: "bg-ok-bg text-ok",
};

function TypeIcon({ type }: { type: CrmActivityLogItem["type"] }) {
  if (type === "call") return <IconPhone width={14} height={14} />;
  if (type === "note") return <IconNote width={14} height={14} />;
  return <IconTasks width={14} height={14} />;
}

/**
 * DESKTOP-ONLY "Recent activity" timeline (design handoff §Main column) —
 * one row per event: a 30px colored icon tile, the bold event name plus a
 * status pill, a one-line body, and a right-aligned timestamp block (bold
 * relative time over the exact Central-time date in IBM Plex Mono).
 *
 * Presentational only — it renders the SAME `CrmActivityLogItem[]` page.tsx
 * already merges from crm_calls + human crm_notes + crm_activities for the
 * mobile Timeline tab; nothing is refetched and nothing is written. Delete
 * still lives on the full Activity tab (ActivityLogSection), which the
 * workspace card's "View all" jumps to — this preview is read-only by
 * design, matching the handoff.
 *
 * Relative times are computed from the real `occurredAt` (formatRelativeTime),
 * never hardcoded the way the static prototype's "2 days ago" strings were.
 */
export function ActivityFeed({ items, limit = 5 }: { items: CrmActivityLogItem[]; limit?: number }) {
  const shown = items.slice(0, limit);

  if (shown.length === 0) {
    return <p className="py-6 text-[13px] text-fg-muted">No activity yet. Calls, notes, and other events land here.</p>;
  }

  return (
    <div className="flex flex-col">
      {shown.map((ev) => (
        <div
          key={`${ev.type}-${ev.id}`}
          className="flex gap-3 border-b border-line px-1 py-3 last:border-b-0"
        >
          <span
            className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${TILE[ev.type]}`}
          >
            <TypeIcon type={ev.type} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <b className="text-fg">{ev.kind ?? ev.title}</b>
              {ev.tag && (
                <span
                  className={`rounded-full px-2 py-px text-[10px] font-bold ${ev.tagTone ?? "bg-slate-bg text-slate"}`}
                >
                  {ev.tag}
                </span>
              )}
              {ev.contactName && <span className="text-[12px] font-medium text-fg-muted">· {ev.contactName}</span>}
            </div>
            {ev.body && (
              <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[12px] leading-[1.45] text-fg-muted">
                {ev.body}
              </p>
            )}
            {ev.author && <p className="mt-0.5 text-[11px] font-medium text-fg-muted">{ev.author}</p>}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5 whitespace-nowrap">
            <span className="text-[12px] font-bold text-fg">{formatRelativeTime(ev.occurredAt)}</span>
            <span className={`${D_MONO} text-[12px] font-medium text-fg-muted`}>{formatDateTime(ev.occurredAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
