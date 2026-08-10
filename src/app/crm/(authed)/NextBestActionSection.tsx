import Link from "next/link";
import { Card, CardHead } from "./_shell/ui";
import { ClickableListItem } from "./_shell/ClickableRow";
import { CompanyAvatar } from "./_shell/InitialAvatar";

export type NbaItem = {
  id: string;
  /** Row navigates here on click (account profile, or a contact/task
   * fallback when there's no account). */
  href: string;
  /** First-letter avatar label — the company name, or the contact's name
   * when the item has no company. */
  avatarLabel: string;
  companyName: string | null;
  /** e.g. "Overdue 3d · Jeff Alvarez" / "No contact in 21d" / "18% profile complete". */
  reason: string;
  tag: "OVERDUE" | "STALE" | null;
  action: { label: "CALL" | "EMAIL" | "RESEARCH" | "FOLLOW UP"; href: string } | null;
};

const TAG_TONE: Record<NonNullable<NbaItem["tag"]>, string> = {
  OVERDUE: "bg-bad-bg text-bad",
  STALE: "bg-warn-bg text-warn",
};

const ACTION_PILL_TONE: Record<NonNullable<NbaItem["action"]>["label"], string> = {
  CALL: "bg-accent text-white hover:bg-accent-hover",
  EMAIL: "bg-accent text-white hover:bg-accent-hover",
  "FOLLOW UP": "border border-warn/40 bg-warn-bg text-warn hover:bg-warn/10",
  RESEARCH: "border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#7c3aed] hover:bg-[#7c3aed]/20",
};

/**
 * NEXT BEST ACTION — the dashboard's primary, widest column: one ranked
 * list mixing overdue follow-ups/tasks, going-stale accounts, and companies
 * needing research (page.tsx builds and tiers the merged `items` — overdue
 * work first, then staleness, then research gaps — see the comment on
 * `buildNextBestAction` there for the exact ordering rule). Deliberately a
 * plain server component: every action pill here is a real `tel:`/`mailto:`/
 * profile-link anchor, never a dialog trigger, so this never needs to cross
 * the RSC function-prop boundary that has bitten this page before.
 */
export function NextBestActionSection({
  items,
  mobileVisibleCount,
}: {
  items: NbaItem[];
  /** Rows beyond this index stay in the DOM (search/print/tab order) but
   * are visually hidden below `lg` — the mockup's mobile "top ~4" cap
   * without needing a second, differently-sliced array from the caller. */
  mobileVisibleCount?: number;
}) {
  return (
    <Card>
      <CardHead title="Next Best Action" hint={items.length ? `${items.length} to work` : "Nothing urgent"} />
      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
          Nothing needs action right now. Every account is on track.
        </p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {items.map((item, idx) => {
            const hiddenOnMobile = mobileVisibleCount !== undefined && idx >= mobileVisibleCount;
            return (
            <ClickableListItem
              key={item.id}
              href={item.href}
              className={`items-start gap-3 px-4 py-3 ${hiddenOnMobile ? "hidden lg:flex" : "flex"}`}
            >
              <CompanyAvatar name={item.avatarLabel} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="truncate text-[14px] font-semibold text-fg hover:underline"
                  >
                    {item.companyName || item.avatarLabel}
                  </Link>
                  {item.tag && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TAG_TONE[item.tag]}`}>
                      {item.tag}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">{item.reason}</p>
              </div>
              {item.action && (
                <a
                  href={item.action.href}
                  className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold transition-colors ${ACTION_PILL_TONE[item.action.label]}`}
                >
                  {item.action.label}
                </a>
              )}
            </ClickableListItem>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
