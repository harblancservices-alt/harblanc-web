import { Card, CardHead } from "./_shell/ui";
import { ClickableListItem } from "./_shell/ClickableRow";
import { DueCountdown } from "./_shell/DueCountdown";

export type FollowupDueItem = {
  id: string;
  contactName: string;
  companyName: string | null;
  accountId: string | null;
  nextFollowupAt: string | null;
  overdue: boolean;
};

/**
 * FOLLOW-UPS DUE — the dashboard's right column, compact variant: company +
 * contact + when, a red dot when overdue (mockup spec — deliberately
 * terser than a full action card, since this column is narrow and the same
 * overdue follow-ups already surface with a Call action inside Next Best
 * Action).
 */
export function FollowupsDueList({
  items,
  mobileVisibleCount,
}: {
  items: FollowupDueItem[];
  /** Rows beyond this index stay in the DOM but are hidden below `lg` — the
   * mockup's mobile "top ~2" cap. */
  mobileVisibleCount?: number;
}) {
  return (
    <Card>
      <CardHead title="Follow-ups Due" hint={items.length ? `${items.length} due` : "Nothing due"} />
      {items.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">No follow-ups due. You're caught up.</p>
      ) : (
        <ul className="divide-y divide-line-strong">
          {items.map((f, idx) => {
            const href = f.accountId ? `/crm/accounts/${f.accountId}` : undefined;
            const hiddenOnMobile = mobileVisibleCount !== undefined && idx >= mobileVisibleCount;
            const itemClass = hiddenOnMobile ? "hidden lg:block" : "block";
            const row = (
              <div className="flex items-start gap-2.5 px-4 py-2.5">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.overdue ? "bg-bad" : "bg-warn"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-fg">
                    {f.companyName || f.contactName}
                  </p>
                  {f.companyName && (
                    <p className="truncate text-[12px] text-fg-muted">{f.contactName}</p>
                  )}
                  <div className="mt-0.5">
                    <DueCountdown iso={f.nextFollowupAt} />
                  </div>
                </div>
              </div>
            );
            return href ? (
              <ClickableListItem key={f.id} href={href} className={itemClass}>
                {row}
              </ClickableListItem>
            ) : (
              <li key={f.id} className={itemClass}>
                {row}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
