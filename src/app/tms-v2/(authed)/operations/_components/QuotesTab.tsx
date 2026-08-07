import Link from "next/link";
import { listLeads, listArchivedLeads } from "@/lib/data/pipeline";
import { loadPipelineCards, PIPELINE_STAGES, type PipelineStage } from "@/lib/dispatch/pipeline";
import { LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/dispatch/status";
import { QuotesListClient } from "./QuotesListClient";
import { ArchivedLeadsSection } from "./ArchivedLeadsSection";

const PAGE_SIZE = 25;

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
  const [list, pipelineCards, archived] = await Promise.all([
    listLeads({ page, pageSize: PAGE_SIZE, status }),
    loadPipelineCards(),
    listArchivedLeads(),
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

      <QuotesListClient rows={list.rows} />

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

      <ArchivedLeadsSection leads={archived} />
    </div>
  );
}
