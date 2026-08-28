import { formatDateTime } from "../../../_shell/format";
import { IconNote, IconPhone, IconTasks } from "../../../_shell/icons";
import type { CrmActivityLogItem } from "../ActivityLogSection";
import { M_DIVIDE } from "./ui";

/** How many events the inline feed shows before "Full history" takes over.
 * Four fills roughly one thumb-scroll without pushing Locations and Tags
 * off the bottom of the page. */
const PREVIEW_COUNT = 4;

/**
 * ACTIVITY — the newest few events inline, phone-sized.
 *
 * Reads the SAME merged `activityItems` array page.tsx already builds for
 * the timeline (calls + human notes + crm_activities events, newest first),
 * so nothing new is queried and this can never disagree with the full log.
 * The complete, un-truncated ActivityLogSection is still rendered — folded
 * into the "Full history" accordion below — so no event becomes unreachable.
 *
 * WHAT A PERSON WROTE COMES FIRST. This preview used to take the newest four
 * items of any kind, which meant the automatic audit trail could bury the
 * human record: on Aztec Rental Center, Tyler's call and note were pushed
 * behind "Task added", "Task completed" and "Task completed", and his note
 * fell off the bottom of a four-slot list entirely. He reported it as the
 * note not appearing, and on a phone it genuinely wasn't.
 *
 * The desktop panel already draws this line — HistoryPanel splits `written`
 * (calls + notes) from `events` and shows the audit trail only on request.
 * That rule was never carried over here, which is the whole bug. It is the
 * same rule now: calls and notes get the four slots.
 *
 * Automatic events are NOT hidden — they are one tap away in Full history,
 * and when a company has nothing written yet they still fill this preview,
 * because "nothing has happened" and "nobody has written anything down" are
 * different statements and only one of them would be true.
 */
export function previewItems(
  items: CrmActivityLogItem[],
  count: number = PREVIEW_COUNT,
): CrmActivityLogItem[] {
  const written = items.filter((i) => i.type === "call" || i.type === "note");
  return (written.length > 0 ? written : items).slice(0, count);
}

export function MobileActivity({ items }: { items: CrmActivityLogItem[] }) {
  const preview = previewItems(items);
  const hiddenEvents = preview.some((i) => i.type === "call" || i.type === "note")
    ? items.length - preview.length
    : 0;

  if (preview.length === 0) {
    return (
      <p className="px-[13px] py-[18px] text-[12.5px] font-semibold text-fg-muted">
        Nothing logged on this company yet — a call, a note, or a stage change will show up here.
      </p>
    );
  }

  return (
    <div className="px-[13px]">
      {preview.map((it, i) => {
        const tone =
          it.type === "call"
            ? "bg-accent/10 text-accent"
            : it.type === "note"
              ? "bg-inset text-fg-muted"
              : "bg-ok-bg text-ok";
        const icon =
          it.type === "call" ? (
            <IconPhone width={14} height={14} />
          ) : it.type === "note" ? (
            <IconNote width={14} height={14} />
          ) : (
            <IconTasks width={14} height={14} />
          );
        const meta = [formatDateTime(it.occurredAt), it.author].filter(Boolean).join(" · ");
        return (
          <div key={`${it.type}-${it.id}`} className={`flex gap-[11px] py-2.5 ${i === 0 ? "" : M_DIVIDE}`}>
            <span className={`flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-full ${tone}`}>
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold leading-[1.38] text-fg [overflow-wrap:anywhere]">
                {it.title}
                {it.contactName ? ` · ${it.contactName}` : ""}
              </p>
              {it.body && (
                <p className="mt-0.5 line-clamp-2 text-[12px] font-medium text-fg-muted [overflow-wrap:anywhere]">
                  {it.body}
                </p>
              )}
              <p className="crm-num mt-0.5 text-[11px] font-semibold text-fg-muted">{meta}</p>
            </div>
          </div>
        );
      })}

      {/* Says where the rest went, so a count in the accordion header below
          is not a mystery and nobody thinks something was dropped. */}
      {hiddenEvents > 0 && (
        <p className="pb-2.5 pt-0.5 text-[11.5px] font-medium text-fg-subtle">
          {hiddenEvents} automatic {hiddenEvents === 1 ? "record" : "records"} in Full history
        </p>
      )}
    </div>
  );
}
