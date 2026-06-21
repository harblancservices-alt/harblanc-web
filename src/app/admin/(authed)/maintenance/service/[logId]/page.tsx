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
} from "../../MaintenanceView";
import { ServiceDetail } from "./ServiceDetail";

export const metadata: Metadata = {
  title: "Service entry",
  robots: { index: false, follow: false },
};

/**
 * Per-SERVICE detail page — the detail view for ONE logged service entry.
 *
 * Service-history cards route here for custom / one-off services (item_id
 * null), which have no item detail page of their own. Tracked services route
 * to the item detail page instead. This gives every history card a detail view
 * (with the blue back button) before any edit — tapping a card never jumps
 * straight into the edit form.
 *
 * Loads the one maintenance_log row, its expense lines + receipts (signed), and
 * the item list + current odometer (so the shared ServiceModal can open in edit
 * mode from here).
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
};

type AttRow = {
  id: string;
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

async function loadServiceDetail(logId: string): Promise<{
  entry: ServiceHistoryEntry;
  allItems: MaintItem[];
  currentOdo: number;
} | null> {
  const sb = createServiceRoleClient();

  const [{ data: logRow }, { data: itemRows }, { data: odoRows }] =
    await Promise.all([
      sb
        .from("maintenance_log")
        .select(
          "id, item_id, service_name, service_odo, service_date, notes, total_cost",
        )
        .eq("id", logId)
        .maybeSingle<LogRow>(),
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
    ]);

  if (!logRow) return null;

  const currentOdo = currentOdoFromLoads(odoRows);
  const allItems: MaintItem[] = (itemRows ?? []).map((it) => {
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
  const itemName = new Map((itemRows ?? []).map((i) => [i.id, i.name]));

  // Expense lines + their receipts (signed) for this one log.
  const expenses: ServiceExpenseLine[] = [];
  const unlinkedAttachments: ServiceHistoryEntry["unlinkedAttachments"] = [];
  const [{ data: attRows }, { data: expRows }] = await Promise.all([
    sb
      .from("maintenance_attachments")
      .select(
        "id, expense_id, file_path, thumb_path, file_name, content_type, amount, label",
      )
      .eq("log_id", logId)
      .returns<AttRow[]>(),
    sb
      .from("maintenance_expenses")
      .select("id, description, amount, created_at")
      .eq("log_id", logId)
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
      unlinkedAttachments.push(sa);
    }
  }
  for (const e of expRows ?? []) {
    expenses.push({
      id: e.id,
      description: e.description,
      amount: num(e.amount),
      attachments: attByExpense.get(e.id) ?? [],
    });
  }

  const entry: ServiceHistoryEntry = {
    id: logRow.id,
    itemId: logRow.item_id,
    serviceName:
      logRow.service_name ??
      (logRow.item_id ? itemName.get(logRow.item_id) ?? null : null) ??
      "Service",
    date: logRow.service_date,
    odo: logRow.service_odo,
    notes: logRow.notes,
    totalCost: num(logRow.total_cost),
    expenses,
    unlinkedAttachments,
  };

  return { entry, allItems, currentOdo };
}

export default async function MaintenanceServicePage({
  params,
}: {
  params: Promise<{ logId: string }>;
}) {
  const { logId } = await params;
  const data = await loadServiceDetail(logId);
  if (!data) notFound();

  return (
    <ServiceDetail
      entry={data.entry}
      allItems={data.allItems}
      currentOdo={data.currentOdo}
    />
  );
}
