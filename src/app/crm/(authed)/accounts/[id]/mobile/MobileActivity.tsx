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
 */
export function MobileActivity({ items }: { items: CrmActivityLogItem[] }) {
  const preview = items.slice(0, PREVIEW_COUNT);

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
    </div>
  );
}
