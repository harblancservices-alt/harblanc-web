"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { Button } from "@/components/tms-v2/ui/Button";
import type { ApplicationRow } from "@/lib/data/pipeline";
import { formatPhone } from "@/lib/domain/phone";
import { softDeleteApplications } from "@/actions/tms-v2/applications";

const COLUMNS: DataListColumn<ApplicationRow>[] = [
  { key: "name", header: "Name", render: (a) => <span className="font-medium text-fg">{a.name}</span> },
  { key: "phone", header: "Phone", render: (a) => formatPhone(a.phone) },
  { key: "email", header: "Email", render: (a) => a.email, hideOnMobile: true },
  { key: "equipment", header: "Equipment", render: (a) => a.equipmentType },
  { key: "cdl", header: "CDL", render: (a) => a.cdlStatus, hideOnMobile: true },
  { key: "experience", header: "Experience", render: (a) => (a.yearsExperience ? `${a.yearsExperience} yrs` : "—"), hideOnMobile: true },
  { key: "home", header: "Home base", render: (a) => a.homeBase ?? "—", hideOnMobile: true },
  { key: "created", header: "Submitted", render: (a) => <DateTimeCST value={a.createdAt} mode="date" />, align: "right" },
];

/** Applications active list + bulk trash — checkboxes always visible (same
 * always-on selection UX as ExpensesListClient, Phase 6 item 3), not a
 * select-mode toggle. */
export function ApplicationsListClient({ rows }: { rows: ApplicationRow[] }) {
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
    if (!confirm(`Move ${selected.size} application${selected.size === 1 ? "" : "s"} to trash?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await softDeleteApplications(Array.from(selected));
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
        rowKey={(a) => a.id}
        getHref={(a) => `/tms-v2/operations/applications/${a.id}`}
        emptyMessage="No applications submitted yet."
        selection={{ selectedIds: selected, onToggle, onToggleAll, allSelected: rows.length > 0 && selected.size === rows.length }}
      />
    </div>
  );
}
