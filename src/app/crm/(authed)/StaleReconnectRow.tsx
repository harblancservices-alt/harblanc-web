"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ClickableListItem } from "./_shell/ClickableRow";
import { CompanyAvatar } from "./_shell/InitialAvatar";
import { IconX } from "./_shell/icons";
import { BTN_ACTION } from "./_shell/ui";
import { dismissAttention } from "./needs-attention-actions";

export type StaleReconnectCompany = {
  id: string;
  name: string;
  /** null = never contacted at all. */
  daysSinceContact: number | null;
  primaryContactName: string | null;
};

/**
 * One row in "Going Stale — Reconnect" — same staleness computation and the
 * same 5-day Dismiss capability as the dashboard's old Needs-attention list,
 * restyled per the approved mockup: a day-count badge ("21d") instead of a
 * "No contact in Nd" sentence, plus the company's avatar and primary contact
 * (crm_accounts.primary_contact_id) so a rep sees WHO to reconnect with, not
 * just which company. Client component because Dismiss calls a server
 * action directly — same RSC-boundary reasoning as the row it replaces.
 */
export function StaleReconnectRow({ company }: { company: StaleReconnectCompany }) {
  const [pending, startTransition] = useTransition();
  const dayBadge = company.daysSinceContact === null ? "Never" : `${company.daysSinceContact}d`;

  function onDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await dismissAttention(company.id);
    });
  }

  return (
    <ClickableListItem href={`/crm/accounts/${company.id}`} className="flex items-center gap-3 px-4 py-2.5">
      <CompanyAvatar name={company.name} className="h-8 w-8 text-[12px]" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/crm/accounts/${company.id}`}
          prefetch={false}
          className="truncate text-[13.5px] font-semibold text-fg hover:underline"
        >
          {company.name}
        </Link>
        {company.primaryContactName && (
          <p className="truncate text-[12px] text-fg-muted">{company.primaryContactName}</p>
        )}
      </div>
      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-warn-bg px-2 font-mono text-[11.5px] font-bold tabular-nums text-warn">
        {dayBadge}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        disabled={pending}
        aria-label={`Dismiss ${company.name}`}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${BTN_ACTION}`}
      >
        <IconX width={12} height={12} />
      </button>
    </ClickableListItem>
  );
}
