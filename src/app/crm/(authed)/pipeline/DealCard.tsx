"use client";

import { useTransition } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMoney, formatDate } from "../_shell/format";
import { moveDealStage, deleteDeal } from "./actions";
import type { DealCardData, StageOption } from "./types";

/**
 * One deal card on the pipeline board. The card body is a "stretched link"
 * (an absolutely-positioned <Link> under the content, z-index'd below it) to
 * the linked company profile — there's no deal detail page yet — while the
 * stage <select> AND the delete button sit in their own stacking layer above
 * the link so they keep working as their own controls instead of triggering
 * navigation.
 */
export function DealCard({
  deal,
  stages,
  currentStageId,
  canDelete = false,
}: {
  deal: DealCardData;
  stages: StageOption[];
  currentStageId: string;
  /** Deals are a shared record — deletion is owner-only, enforced again
   * server-side in deleteDeal regardless of this UI gate. */
  canDelete?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onMove(e: ChangeEvent<HTMLSelectElement>) {
    const stageId = e.target.value;
    if (!stageId || stageId === currentStageId) return;
    startTransition(async () => {
      const res = await moveDealStage(deal.id, stageId);
      if (res.ok) router.refresh();
    });
  }

  function onDelete() {
    if (!window.confirm(`Delete "${deal.name}"? This can't be undone from here.`)) return;
    startTransition(async () => {
      const res = await deleteDeal(deal.id, deal.accountId);
      if (res.ok) router.refresh();
    });
  }

  const href = deal.accountId ? `/crm/accounts/${deal.accountId}` : null;

  return (
    <div className="relative rounded-xl border border-line-strong bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3">
      {href && (
        <Link
          href={href}
          prefetch={false}
          className="absolute inset-0 z-0 rounded-xl"
          aria-label={`Open ${deal.companyName ?? deal.name}`}
        />
      )}
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          aria-label={`Delete ${deal.name}`}
          className="absolute right-2 top-2 z-10 rounded-md p-1 text-fg-subtle transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-60"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      <div className="relative z-10 pointer-events-none">
        <p
          className={`text-[13.5px] font-semibold leading-snug text-fg ${canDelete ? "pr-5" : ""}`}
        >
          {deal.name}
        </p>
        {deal.companyName && (
          <p className="mt-0.5 truncate text-[12px] text-fg-muted">{deal.companyName}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
          <span className="font-mono font-semibold text-fg">
            {formatMoney(deal.estimatedRevenue)}
          </span>
          <span className="truncate text-fg-subtle">{deal.ownerName ?? "Unassigned"}</span>
        </div>
        {deal.expectedCloseDate && (
          <p className="mt-1 text-[11px] text-fg-subtle">
            Close {formatDate(deal.expectedCloseDate)}
          </p>
        )}
      </div>
      <div className="relative z-10 mt-2">
        <select
          value={currentStageId}
          onChange={onMove}
          disabled={pending || stages.length < 2}
          aria-label={`Move ${deal.name} to a different stage`}
          className="h-8 w-full rounded-md border border-line-strong bg-card px-2 text-[12px] text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
