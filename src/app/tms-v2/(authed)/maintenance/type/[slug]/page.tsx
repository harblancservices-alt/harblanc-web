import { notFound } from "next/navigation";
import { BackButton } from "@/components/tms-v2/ui/BackButton";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getServiceTypeDetail, getServiceTypesOverview } from "@/lib/data/maintenance";
import { ServiceTypeLogButton, HistoryRow } from "./ServiceTypeActions";

// A service's status/history can change between visits — read live,
// matching the Maintenance home's own force-dynamic choice.
export const dynamic = "force-dynamic";

function intervalLineText(intervalMiles: number | null): string {
  return intervalMiles == null ? "No interval set yet" : `Preventive · every ${intervalMiles.toLocaleString()} mi`;
}

function metricText(value: number | null): string {
  return value != null ? `${value.toLocaleString()} mi` : "—";
}

const STATUS_LABEL: Record<string, string> = { overdue: "Overdue", soon: "Due soon", ok: "OK", baseline: "Set baseline" };
const STATUS_CLASS: Record<string, string> = { overdue: "text-bad", soon: "text-warn", ok: "text-ok", baseline: "text-white/70" };

/**
 * Service-type profile (Brent's per-service redesign, 2026-08-08) — one
 * type's own history and its own logging, reached by tapping its card on
 * the Maintenance home. Dark header (back box, name, interval line, a
 * LAST DONE / DUE AT / STATUS metric row), a blue "+ Log this service"
 * (type pre-filled — ServiceTypeActions.tsx's preset), and a HISTORY card
 * listing every visit that included this type, newest first.
 */
export default async function ServiceTypeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [detail, overview] = await Promise.all([getServiceTypeDetail(slug), getServiceTypesOverview()]);
  if (!detail) notFound();

  const partGroups = [...new Set(overview.types.map((t) => t.label))];
  const statusLabel = detail.status ? (STATUS_LABEL[detail.status] ?? "—") : "—";
  const statusClass = detail.status ? (STATUS_CLASS[detail.status] ?? "text-white/70") : "text-white/70";

  return (
    <PageScroll>
      <div className="flex flex-col gap-5">
        <div className="overflow-hidden rounded-xl shadow-e2" style={{ backgroundColor: "#0d1117" }}>
          <div className="px-4 pt-4">
            <BackButton href="/tms-v2/maintenance" label="Services" />
          </div>
          <div className="px-4 pb-4 pt-3">
            <div className="text-[22px] font-semibold leading-tight text-white">{detail.label}</div>
            <div className="mt-0.5 text-[13px] text-white/60">{intervalLineText(detail.intervalMiles)}</div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
            <div className="px-3 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Last done</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white">{metricText(detail.lastOdo)}</div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Due at</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white">{metricText(detail.nextDue)}</div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Status</div>
              <div className={`mt-0.5 text-[14px] font-semibold ${statusClass}`}>{statusLabel}</div>
            </div>
          </div>
        </div>

        <ServiceTypeLogButton
          currentOdo={detail.currentOdo}
          partGroups={partGroups}
          preset={{
            typeLabel: detail.label,
            category: detail.category,
            subCategory: null,
            partGroup: detail.partGroup,
            reminderIntervalMiles: detail.intervalMiles,
          }}
        />

        <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
          <div className="border-b border-line px-4 py-3">
            <div className="text-[14px] font-semibold text-fg">History</div>
          </div>
          {detail.history.length === 0 ? (
            <div className="px-4 py-4 text-[13px] text-fg-muted">Nothing logged for this type yet.</div>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {detail.history.map((item) => (
                <HistoryRow key={item.serviceId} item={item} currentOdo={detail.currentOdo} partGroups={partGroups} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageScroll>
  );
}
