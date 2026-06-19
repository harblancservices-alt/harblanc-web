import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  MaintenanceView,
  type MaintItem,
  type ServiceHistoryEntry,
} from "./MaintenanceView";
import {
  computeMaintenance,
  currentOdoFromLoads,
} from "@/lib/dispatch/maintenance";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

/**
 * Maintenance — preventative service schedule for the 2018 Ram 2500 6.7L
 * Cummins. Server component: loads the non-deleted maintenance_items and the
 * truck's current odometer (the highest reading across all non-deleted
 * loads), computes each item's next-due / miles-remaining / status, and
 * hands plain data to the client view. Service-role client, same posture as
 * the load page.
 */

type ItemRow = {
  id: string;
  name: string;
  interval_miles: number;
  last_service_odo: number | null;
  last_service_date: string | null;
  notes: string | null;
  sort_order: number;
};

type OdoRow = {
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
};

type LogRow = {
  id: string;
  item_id: string | null;
  service_name: string | null;
  service_odo: number | null;
  service_date: string | null;
  notes: string | null;
  category: string | null;
  total_cost: number | string | null;
  created_at: string;
};
type AttRow = {
  id: string;
  log_id: string;
  file_path: string;
  file_name: string | null;
  content_type: string | null;
  amount: number | string | null;
  label: string | null;
};

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const RECEIPT_BUCKET = "maintenance-receipts";

// Status priority for surfacing the urgent items first.
const STATUS_RANK: Record<MaintItem["status"], number> = {
  overdue: 0,
  soon: 1,
  baseline: 2,
  ok: 3,
};

async function loadMaintenance(): Promise<{
  currentOdo: number;
  items: MaintItem[];
  history: ServiceHistoryEntry[];
  totalSpend: number;
}> {
  const sb = createServiceRoleClient();

  const [{ data: itemRows }, { data: odoRows }, { data: logRows }] =
    await Promise.all([
      sb
        .from("maintenance_items")
        .select(
          "id, name, interval_miles, last_service_odo, last_service_date, notes, sort_order",
        )
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .returns<ItemRow[]>(),
      sb
        .from("loads")
        .select("odo_assigned, odo_loaded, odo_delivered")
        .is("deleted_at", null)
        .returns<OdoRow[]>(),
      sb
        .from("maintenance_log")
        .select(
          "id, item_id, service_name, service_odo, service_date, notes, category, total_cost, created_at",
        )
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<LogRow[]>(),
    ]);

  // Current odometer = GREATEST(MAX(odo_assigned), MAX(odo_loaded),
  // MAX(odo_delivered)) across non-deleted loads.
  const currentOdo = currentOdoFromLoads(odoRows);

  const items: MaintItem[] = (itemRows ?? []).map((it) => {
    const m = computeMaintenance(
      it.interval_miles,
      it.last_service_odo,
      currentOdo,
    );
    return {
      id: it.id,
      name: it.name,
      interval: it.interval_miles,
      lastOdo: it.last_service_odo,
      lastDate: it.last_service_date,
      neverServiced: m.neverServiced,
      nextDue: m.nextDue,
      milesRemaining: m.milesRemaining,
      status: m.status,
      pct: m.pct,
      notes: it.notes,
    };
  });

  // Surface overdue → due soon → needs baseline → ok, most-urgent first.
  items.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    const am = a.milesRemaining ?? Number.POSITIVE_INFINITY;
    const bm = b.milesRemaining ?? Number.POSITIVE_INFINITY;
    return am - bm;
  });

  // Service history (newest first) + each log's receipts as signed URLs.
  const logs = logRows ?? [];
  const itemName = new Map((itemRows ?? []).map((i) => [i.id, i.name]));
  const attByLog = new Map<string, ServiceHistoryEntry["attachments"]>();
  if (logs.length > 0) {
    const { data: attRows } = await sb
      .from("maintenance_attachments")
      .select("id, log_id, file_path, file_name, content_type, amount, label")
      .in(
        "log_id",
        logs.map((l) => l.id),
      )
      .returns<AttRow[]>();
    const atts = attRows ?? [];
    // Sign every receipt path in ONE storage request (was an N+1 of per-file
    // createSignedUrl calls across the last 100 logs). Map back by path.
    const signedByPath = new Map<string, string>();
    if (atts.length > 0) {
      const { data: signedList } = await sb.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrls(
          atts.map((a) => a.file_path),
          3600,
        );
      for (const s of signedList ?? []) {
        if (s.path && s.signedUrl && !s.error) {
          signedByPath.set(s.path, s.signedUrl);
        }
      }
    }
    for (const a of atts) {
      const list = attByLog.get(a.log_id) ?? [];
      list.push({
        id: a.id,
        name: a.file_name ?? "receipt",
        url: signedByPath.get(a.file_path) ?? null,
        isImage: (a.content_type ?? "").startsWith("image/"),
        amount: num(a.amount),
        label: a.label,
      });
      attByLog.set(a.log_id, list);
    }
  }

  const history: ServiceHistoryEntry[] = logs.map((l) => ({
    id: l.id,
    serviceName:
      l.service_name ??
      (l.item_id ? itemName.get(l.item_id) ?? null : null) ??
      "Service",
    date: l.service_date,
    odo: l.service_odo,
    notes: l.notes,
    category: l.category,
    totalCost: num(l.total_cost),
    attachments: attByLog.get(l.id) ?? [],
  }));

  // Total maintenance spend across every logged service.
  const totalSpend = history.reduce((s, h) => s + (h.totalCost ?? 0), 0);

  return { currentOdo, items, history, totalSpend };
}

export default async function MaintenancePage() {
  const { currentOdo, items, history, totalSpend } = await loadMaintenance();
  return (
    <MaintenanceView
      currentOdo={currentOdo}
      items={items}
      history={history}
      totalSpend={totalSpend}
    />
  );
}
