import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeMaintenance,
  currentOdoFromLoads,
} from "@/lib/dispatch/maintenance";
import type {
  MaintItem,
  ServiceExpenseLine,
  ServiceHistoryEntry,
} from "../MaintenanceView";
import { MaintenanceItemDetail } from "./MaintenanceItemDetail";

export const metadata: Metadata = {
  title: "Maintenance item",
  robots: { index: false, follow: false },
};

/**
 * Per-item maintenance detail / profile page.
 *
 * Server component. Loads every non-deleted maintenance_item (so the shared
 * ServiceModal's type dropdown still works), the truck's current odometer,
 * and the FULL service log for THIS item (every maintenance_log row whose
 * item_id matches), newest first, with each log's receipts signed. Computes
 * the item's status / next-due / progress and the per-item total spend, then
 * hands plain data to the client detail view.
 *
 * Mirrors the main /admin/maintenance loader, but the log query is scoped to
 * one item and is unbounded (Brent must see EVERY service he logged here).
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

async function loadItemDetail(itemId: string): Promise<{
  item: MaintItem;
  allItems: MaintItem[];
  currentOdo: number;
  log: ServiceHistoryEntry[];
  totalSpent: number;
} | null> {
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
      // Full, unbounded log for THIS item, newest first.
      sb
        .from("maintenance_log")
        .select(
          "id, item_id, service_name, service_odo, service_date, notes, total_cost, created_at",
        )
        .eq("item_id", itemId)
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .returns<LogRow[]>(),
    ]);

  const rows = itemRows ?? [];
  const focused = rows.find((r) => r.id === itemId);
  if (!focused) return null; // unknown / deleted item → 404

  const currentOdo = currentOdoFromLoads(odoRows);

  const toMaintItem = (it: ItemRow): MaintItem => {
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
  };

  const allItems = rows.map(toMaintItem);
  const item = toMaintItem(focused);

  // Build each log's expense LINES (with their signed receipts). Receipts not
  // tied to a line (legacy) are kept under the log as "unlinked".
  const logs = logRows ?? [];
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
    const signedByPath = new Map<string, string>();
    if (atts.length > 0) {
      const paths = [
        ...atts.map((a) => a.file_path),
        ...atts.map((a) => a.thumb_path).filter((p): p is string => !!p),
      ];
      const { data: signedList } = await sb.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrls(paths, 3600);
      for (const sgn of signedList ?? []) {
        if (sgn.path && sgn.signedUrl && !sgn.error) {
          signedByPath.set(sgn.path, sgn.signedUrl);
        }
      }
    }
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

  const log: ServiceHistoryEntry[] = logs.map((l) => ({
    id: l.id,
    itemId: l.item_id,
    serviceName: l.service_name ?? focused.name ?? "Service",
    date: l.service_date,
    odo: l.service_odo,
    notes: l.notes,
    totalCost: num(l.total_cost),
    expenses: expensesByLog.get(l.id) ?? [],
    unlinkedAttachments: unlinkedByLog.get(l.id) ?? [],
  }));

  const totalSpent = log.reduce((s, h) => s + (h.totalCost ?? 0), 0);

  return { item, allItems, currentOdo, log, totalSpent };
}

export default async function MaintenanceItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadItemDetail(id);
  if (!data) notFound();

  return (
    <MaintenanceItemDetail
      item={data.item}
      allItems={data.allItems}
      currentOdo={data.currentOdo}
      log={data.log}
      totalSpent={data.totalSpent}
    />
  );
}
