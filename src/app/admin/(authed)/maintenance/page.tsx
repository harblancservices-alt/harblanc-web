import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  MaintenanceView,
  type MaintItem,
  type MaintSummary,
  type ServiceExpenseLine,
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
  total_cost: number | string | null;
  created_at: string;
};
type AttRow = {
  id: string;
  log_id: string;
  expense_id: string | null;
  file_path: string;
  thumb_path: string | null;
  file_name: string | null;
  content_type: string | null;
  amount: number | string | null;
  label: string | null;
};
type ExpRow = {
  id: string;
  log_id: string;
  description: string | null;
  amount: number | string | null;
  created_at: string;
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
  summary: MaintSummary;
}> {
  const sb = createServiceRoleClient();

  const [
    { data: itemRows },
    { data: odoRows },
    { data: logRows },
    { data: logAggRows },
  ] = await Promise.all([
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
        "id, item_id, service_name, service_odo, service_date, notes, total_cost, created_at",
      )
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<LogRow[]>(),
    // Unbounded aggregate over EVERY log (the list above is capped at 100):
    // lifetime spend for the summary band's "Total spent".
    sb
      .from("maintenance_log")
      .select("total_cost")
      .returns<{ total_cost: number | string | null }[]>(),
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

  // Service history (newest first). Each log → its expense LINES, each line →
  // its receipts (signed). Receipts not tied to a line (legacy) are kept under
  // the log as "unlinked".
  const logs = logRows ?? [];
  const itemName = new Map((itemRows ?? []).map((i) => [i.id, i.name]));
  const expensesByLog = new Map<string, ServiceExpenseLine[]>();
  const unlinkedByLog = new Map<string, ServiceHistoryEntry["unlinkedAttachments"]>();
  if (logs.length > 0) {
    const logIds = logs.map((l) => l.id);
    const [{ data: attRows }, { data: expRows }] = await Promise.all([
      sb
        .from("maintenance_attachments")
        .select(
          "id, log_id, expense_id, file_path, thumb_path, file_name, content_type, amount, label",
        )
        .in("log_id", logIds)
        .returns<AttRow[]>(),
      sb
        .from("maintenance_expenses")
        .select("id, log_id, description, amount, created_at")
        .in("log_id", logIds)
        .order("created_at", { ascending: true })
        .returns<ExpRow[]>(),
    ]);
    const atts = attRows ?? [];
    // Sign originals (tap-to-view) and thumbnails (grid) in ONE storage request.
    const signedByPath = new Map<string, string>();
    if (atts.length > 0) {
      const paths = [
        ...atts.map((a) => a.file_path),
        ...atts.map((a) => a.thumb_path).filter((p): p is string => !!p),
      ];
      const { data: signedList } = await sb.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrls(paths, 3600);
      for (const s of signedList ?? []) {
        if (s.path && s.signedUrl && !s.error) {
          signedByPath.set(s.path, s.signedUrl);
        }
      }
    }
    // Group attachments by expense line; ones with no expense_id are "unlinked".
    const attByExpense = new Map<string, ServiceExpenseLine["attachments"]>();
    for (const a of atts) {
      const url = signedByPath.get(a.file_path) ?? null;
      const thumbUrl =
        (a.thumb_path ? signedByPath.get(a.thumb_path) : null) ?? url;
      const sa = {
        id: a.id,
        name: a.file_name ?? "receipt",
        url,
        thumbUrl,
        isImage: (a.content_type ?? "").startsWith("image/"),
        amount: num(a.amount),
        label: a.label,
      };
      if (a.expense_id) {
        const list = attByExpense.get(a.expense_id) ?? [];
        list.push(sa);
        attByExpense.set(a.expense_id, list);
      } else {
        const list = unlinkedByLog.get(a.log_id) ?? [];
        list.push(sa);
        unlinkedByLog.set(a.log_id, list);
      }
    }
    for (const e of expRows ?? []) {
      const list = expensesByLog.get(e.log_id) ?? [];
      list.push({
        id: e.id,
        description: e.description,
        amount: num(e.amount),
        attachments: attByExpense.get(e.id) ?? [],
      });
      expensesByLog.set(e.log_id, list);
    }
  }

  const history: ServiceHistoryEntry[] = logs.map((l) => ({
    id: l.id,
    itemId: l.item_id,
    serviceName:
      l.service_name ??
      (l.item_id ? itemName.get(l.item_id) ?? null : null) ??
      "Service",
    date: l.service_date,
    odo: l.service_odo,
    notes: l.notes,
    totalCost: num(l.total_cost),
    expenses: expensesByLog.get(l.id) ?? [],
    unlinkedAttachments: unlinkedByLog.get(l.id) ?? [],
  }));

  // Lifetime maintenance spend across EVERY logged service (not just the 100
  // shown in the history list).
  const aggLogs = logAggRows ?? [];
  const totalSpend = aggLogs.reduce((s, l) => s + (num(l.total_cost) ?? 0), 0);

  // Next due = the single most urgent serviced item (fewest miles remaining;
  // overdue, i.e. most-negative, first). Never-serviced items have no
  // milesRemaining, so they're excluded.
  const serviced = items.filter((i) => i.milesRemaining != null);
  serviced.sort(
    (a, b) => (a.milesRemaining as number) - (b.milesRemaining as number),
  );
  const top = serviced[0];
  const nextDue = top
    ? { name: top.name, milesRemaining: top.milesRemaining as number }
    : null;

  const summary: MaintSummary = { totalSpend, nextDue };

  return { currentOdo, items, history, totalSpend, summary };
}

export default async function MaintenancePage() {
  const { currentOdo, items, history, totalSpend, summary } =
    await loadMaintenance();
  return (
    <MaintenanceView
      currentOdo={currentOdo}
      items={items}
      history={history}
      totalSpend={totalSpend}
      summary={summary}
    />
  );
}
