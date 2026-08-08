"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { Button } from "@/components/tms-v2/ui/Button";
import type { LeadListRow } from "@/lib/data/pipeline";
import { LeadStatusPill } from "../_lib/lead-status";
import { UrgencyPill } from "../_lib/urgency-pill";
import { softDeleteLeads } from "@/actions/tms-v2/quotes";
import { advanceLeadStatus } from "@/actions/tms-v2/pipeline";
import { suggestedNext, isLeadStatus, LEAD_STATUS_LABELS } from "@/lib/dispatch/status";

/** One-tap "advance to <next stage>" — the row itself already navigates to
 * detail (DataList wraps every cell in its own <Link>), so this button's
 * click has to stop that Link's navigation, not just its own default. */
function AdvanceCell({ lead }: { lead: LeadListRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = isLeadStatus(lead.leadStatus) ? suggestedNext(lead.leadStatus) : null;
  if (!next) return null;

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await advanceLeadStatus(lead.id, next as string);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-md border border-line-strong bg-card px-2 py-1 text-[12px] font-medium text-fg hover:bg-elevated disabled:opacity-50"
    >
      {pending ? "…" : `→ ${LEAD_STATUS_LABELS[next]}`}
    </button>
  );
}

const COLUMNS: DataListColumn<LeadListRow>[] = [
  { key: "name", header: "Name", render: (l) => <span className="font-medium text-fg">{l.name}</span> },
  { key: "lane", header: "Lane", render: (l) => `${l.originLabel} → ${l.destLabel}`, hideOnMobile: true },
  { key: "status", header: "Status", render: (l) => <LeadStatusPill status={l.leadStatus} /> },
  { key: "urgency", header: "Attention", render: (l) => <UrgencyPill chip={l.topUrgency} />, hideOnMobile: true },
  { key: "created", header: "Created", render: (l) => <DateTimeCST value={l.createdAt} mode="date" />, align: "right", hideOnMobile: true },
  { key: "advance", header: "", render: (l) => <AdvanceCell lead={l} />, align: "right" },
];

/** Quote requests active list + bulk trash — same always-on-checkbox
 * pattern as ExpensesListClient/ApplicationsListClient (Phase 6 item 3). */
export function QuotesListClient({ rows }: { rows: LeadListRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function onToggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onToggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function onTrashSelected() {
    if (!confirm(`Move ${selected.size} quote request${selected.size === 1 ? "" : "s"} to trash?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await softDeleteLeads(Array.from(selected));
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      } else {
        setError(res.reason);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-[13px]">
          <span className="font-medium text-fg">{selected.size} selected</span>
          <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={onTrashSelected}>
            Trash selected
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
          {error ? <span className="text-[13px] font-medium text-bad">{error}</span> : null}
        </div>
      ) : null}

      <DataList
        columns={COLUMNS}
        rows={rows}
        rowKey={(l) => l.id}
        getHref={(l) => `/tms-v2/operations/${l.id}`}
        emptyMessage="No quote requests match this filter."
        selection={{ selectedIds: selected, onToggle, onToggleAll, allSelected: rows.length > 0 && selected.size === rows.length }}
      />
    </div>
  );
}
