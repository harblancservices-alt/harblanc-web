import Link from "next/link";
import { ClickableListItem } from "./_shell/ClickableRow";
import { digitsForTel } from "./_shell/contactFields";
import { IconPhone } from "./_shell/icons";
import { BTN_ACTION } from "./_shell/ui";

export type NeedsAttentionCompany = {
  id: string;
  name: string;
  phone: string | null;
  /** null = never contacted at all. */
  daysSinceContact: number | null;
};

/**
 * NEEDS ATTENTION — a company that's gone quiet, longest-since-contact
 * first. Plain server-renderable markup (no interactivity beyond the tel:
 * link and the row's own navigation), matching the CallListRow/TaskRow card
 * pattern used across the dashboard.
 */
export function NeedsAttentionRow({ company }: { company: NeedsAttentionCompany }) {
  const staleLabel =
    company.daysSinceContact === null
      ? "Never contacted"
      : `No contact in ${company.daysSinceContact}d`;

  return (
    <ClickableListItem
      href={`/crm/accounts/${company.id}`}
      className="flex items-center gap-3 px-5 py-3.5"
    >
      <span aria-hidden className="mt-0.5 h-2.5 w-2.5 shrink-0 bg-bad" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/crm/accounts/${company.id}`}
          prefetch={false}
          className="truncate text-[14px] font-semibold text-fg hover:underline"
        >
          {company.name}
        </Link>
        <p className="mt-0.5 text-[12.5px] font-medium text-bad">{staleLabel}</p>
      </div>
      {company.phone ? (
        <a
          href={`tel:${digitsForTel(company.phone)}`}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}
        >
          <IconPhone width={12} height={12} />
          Call
        </a>
      ) : (
        <span
          aria-disabled
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-fg-subtle bg-card px-3 text-[12px] font-medium text-fg-subtle opacity-50"
        >
          No phone
        </span>
      )}
    </ClickableListItem>
  );
}
