import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MaintenanceView, type MaintItem } from "./MaintenanceView";

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
}> {
  const sb = createServiceRoleClient();

  const [{ data: itemRows }, { data: odoRows }] = await Promise.all([
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

  // Current odometer = GREATEST(MAX(odo_assigned), MAX(odo_loaded),
  // MAX(odo_delivered)) across non-deleted loads.
  let currentOdo = 0;
  for (const l of odoRows ?? []) {
    currentOdo = Math.max(
      currentOdo,
      l.odo_assigned ?? 0,
      l.odo_loaded ?? 0,
      l.odo_delivered ?? 0,
    );
  }

  const items: MaintItem[] = (itemRows ?? []).map((it) => {
    const neverServiced = it.last_service_odo == null;
    const nextDue = neverServiced
      ? null
      : (it.last_service_odo as number) + it.interval_miles;
    const milesRemaining = nextDue == null ? null : nextDue - currentOdo;

    // due soon = within 1,000 mi OR past 90% of the interval.
    const soonThreshold = Math.max(1000, Math.round(it.interval_miles * 0.1));

    let status: MaintItem["status"];
    if (neverServiced) status = "baseline";
    else if ((milesRemaining as number) <= 0) status = "overdue";
    else if ((milesRemaining as number) <= soonThreshold) status = "soon";
    else status = "ok";

    return {
      id: it.id,
      name: it.name,
      interval: it.interval_miles,
      lastOdo: it.last_service_odo,
      lastDate: it.last_service_date,
      neverServiced,
      nextDue,
      milesRemaining,
      status,
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

  return { currentOdo, items };
}

export default async function MaintenancePage() {
  const { currentOdo, items } = await loadMaintenance();
  return <MaintenanceView currentOdo={currentOdo} items={items} />;
}
