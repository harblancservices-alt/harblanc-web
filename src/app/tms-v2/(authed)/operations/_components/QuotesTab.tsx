import Link from "next/link";
import { DataList, type DataListColumn } from "@/components/tms-v2/ui/DataList";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { listLeads, type LeadListRow } from "@/lib/data/pipeline";
import { loadPipelineCards, PIPELINE_STAGES, type PipelineStage } from "@/lib/dispatch/pipeline";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/dispatch/status";
import { LeadStatusPill } from "../_lib/lead-status";
import { UrgencyPill } from "../_lib/urgency-pill";

const PAGE_SIZE = 25;

const COLUMNS: DataListColumn<LeadListRow>[] = [
  { key: "name", header: "Name", render: (l) => <span className="font-medium text-fg">{l.name}</span> },
  { key: "lane", header: "Lane", render: (l) => `${l.originLabel} → ${l.destLabel}`, hideOnMobile: true },
  { key: "status", header: "Status", render: (l) => <LeadStatusPill status={l.leadStatus} /> },
  { key: "urgency", header: "Attention", render: (l) => <UrgencyPill chip={l.topUrgency} /> },
  { key: "created", header: "Created", render: (l) => <DateTimeCST value={l.createdAt} mode="date" />, align: "right", hideOnMobile: true },
];

function buildHref(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  usp.set("tab", "quotes");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  return `/tms-v2/operations?${usp.toString()}`;
}

function FunnelStrip({ counts, total }: { counts: Record<PipelineStage, number>; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-xl border border-line bg-card px-3 py-2.5 text-[13px] shadow-e1">
      {PIPELINE_STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          {i > 0 ? <span className="text-fg-muted">→</span> : null}
          <span className="text-fg-muted">{s.label}</span>
          <span className="font-mono font-medium tabular-nums text-fg">{counts[s.key]}</span>
        </div>
      ))}
      <span className="ml-auto text-fg-muted">{total} in pipeline</span>
    </div>
  );
}

export async function QuotesTab({ page, status }: { page: number; status?: string }) {
  const [list, pipelineCards] = await Promise.all([
    listLeads({ page, pageSize: PAGE_SIZE, status }),
    loadPipelineCards(),
  ]);
  const activeCards = pipelineCards.filter((c) => c.status !== "expired");
  const counts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 0])) as Record<PipelineStage, number>;
  for (const c of activeCards) counts[c.stage] += 1;

  return (
    <div className="flex flex-col gap-4">
      <FunnelStrip counts={counts} total={activeCards.length} />

      <form className="flex flex-wrap items-end gap-3" method="GET">
        <input type="hidden" name="tab" value="quotes" />
        <label className="flex flex-col gap-1 text-[13px] text-fg-muted">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 w-56 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg"
          >
            <option value="">All statuses (13)</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg hover:bg-elevated">
          Filter
        </button>
        {status ? (
          <Link href="/tms-v2/operations?tab=quotes" className="text-[13px] text-fg-muted underline">
            Clear
          </Link>
        ) : null}
      </form>

      <DataList
        columns={COLUMNS}
        rows={list.rows}
        rowKey={(l) => l.id}
        getHref={(l) => `/tms-v2/operations/${l.id}`}
        emptyMessage="No quote requests match this filter."
      />

      <div className="flex items-center justify-between text-[13px] text-fg-muted">
        <span>
          {list.totalCount} lead{list.totalCount === 1 ? "" : "s"} · page {page}
        </span>
        <div className="flex gap-3">
          {page > 1 ? (
            <Link href={buildHref({ status, page: page - 1 })} className="underline">
              ← Prev
            </Link>
          ) : null}
          {list.hasMore ? (
            <Link href={buildHref({ status, page: page + 1 })} className="underline">
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
