"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ClickableListItem } from "./_shell/ClickableRow";
import { IconX } from "./_shell/icons";
import { BTN_ACTION } from "./_shell/ui";
import { dismissAttention } from "./needs-attention-actions";

export type NeedsAttentionCompany = {
  id: string;
  name: string;
  /** null = never contacted at all. */
  daysSinceContact: number | null;
};

/**
 * NEEDS ATTENTION — a company that's gone quiet, longest-since-contact
 * first, matching the CallListRow/TaskRow card pattern used across the
 * dashboard. Client component (not plain server markup) because Dismiss
 * calls a server action directly — owning the handler here keeps the
 * dashboard page itself a pure Server Component with no function props
 * crossing the RSC boundary.
 */
export function NeedsAttentionRow({ company }: { company: NeedsAttentionCompany }) {
  const [pending, startTransition] = useTransition();
  const staleLabel =
    company.daysSinceContact === null
      ? "Never contacted"
      : `No contact in ${company.daysSinceContact}d`;

  function onDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await dismissAttention(company.id);
    });
  }

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
      <button
        type="button"
        onClick={onDismiss}
        disabled={pending}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`}
      >
        <IconX width={12} height={12} />
        {pending ? "Dismissing…" : "Dismiss"}
      </button>
    </ClickableListItem>
  );
}
