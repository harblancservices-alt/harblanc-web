import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoMaintenanceHome } from "@/lib/demo/demoData";
import { MaintenanceHome } from "./MaintenanceHome";
import {
  CATEGORIES,
  CATEGORY_SLUG,
  computeFreshness,
  computeMaintenance,
  currentOdoFromLoads,
  groupKey,
  isCategory,
  isPosition,
  type Category,
} from "@/lib/dispatch/repair-log";
import type {
  CategoryCard,
  PreventativeSummary,
  RepairEntry,
  ReminderView,
} from "./types";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

/**
 * Maintenance home — the truck's repair log, parts-first, grouped by category.
 *
 * Server component. Loads the parts (repair_entries) joined to their services
 * (date + odometer), the reminder overlay, and the current odometer, then
 * derives per-category cards (count + attention badge), the overdue/due-soon
 * reminder alerts, and the full part list (for global search). Money is
 * de-emphasized — no cost rollups here.
 */

type PartRow = {
  id: string;
  description: string;
  position: string | null;
  part_group: string | null;
  category: string;
  service_id: string;
  created_at: string;
  is_preventative: boolean;
};

type ServiceRow = {
  id: string;
  service_date: string | null;
  odometer: number | null;
  notes: string | null;
};

type ReminderRow = {
  id: string;
  label: string;
  part_group: string;
  category: string;
  interval_miles: number;
  anchor_odo: number | null;
  anchor_date: string | null;
};

type OdoRow = {
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
};

function cat(v: string): Category {
  return isCategory(v) ? v : "Other";
}

async function loadHome(): Promise<{
  currentOdo: number;
  categoryCards: CategoryCard[];
  preventative: PreventativeSummary;
  alertReminders: ReminderView[];
  entries: RepairEntry[];
  partGroups: string[];
}> {
  const sb = createServiceRoleClient();

  const [
    { data: partRows },
    { data: serviceRows },
    { data: reminderRows },
    { data: odoRows },
    { data: attRows },
    { data: linkRows },
  ] = await Promise.all([
    sb
      .from("repair_entries")
      .select("id, description, position, part_group, category, service_id, created_at, is_preventative")
      .is("deleted_at", null)
      .returns<PartRow[]>(),
    sb
      .from("repair_services")
      .select("id, service_date, odometer, notes")
      .returns<ServiceRow[]>(),
    sb
      .from("repair_reminders")
      .select("id, label, part_group, category, interval_miles, anchor_odo, anchor_date")
      .is("dismissed_at", null)
      .returns<ReminderRow[]>(),
    sb
      .from("loads")
      .select("odo_assigned, odo_loaded, odo_delivered")
      .is("deleted_at", null)
      .returns<OdoRow[]>(),
    sb.from("repair_attachments").select("service_id").returns<{ service_id: string }[]>(),
    sb
      .from("repair_links")
      .select("a_id, b_id")
      .returns<{ a_id: string; b_id: string }[]>(),
  ]);

  const currentOdo = currentOdoFromLoads(odoRows);
  const today = new Date().toISOString().slice(0, 10);

  const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));
  const receiptCountByService = new Map<string, number>();
  for (const a of attRows ?? []) {
    receiptCountByService.set(
      a.service_id,
      (receiptCountByService.get(a.service_id) ?? 0) + 1,
    );
  }
  const relatedCount = new Map<string, number>();
  for (const l of linkRows ?? []) {
    relatedCount.set(l.a_id, (relatedCount.get(l.a_id) ?? 0) + 1);
    relatedCount.set(l.b_id, (relatedCount.get(l.b_id) ?? 0) + 1);
  }

  // Part rows enriched with their service's date + odometer, newest first.
  const parts = (partRows ?? []).map((p) => {
    const s = serviceById.get(p.service_id);
    return {
      row: p,
      date: s?.service_date ?? null,
      odometer: s?.odometer ?? null,
      notes: s?.notes ?? null,
    };
  });
  parts.sort((a, b) => {
    const d = (b.date ?? "").localeCompare(a.date ?? "");
    if (d !== 0) return d;
    return b.row.created_at.localeCompare(a.row.created_at);
  });

  // Group aggregates (latest odo/date per part_group) for reminder next-due.
  const groupMaxOdo = new Map<string, number>();
  const groupMaxDate = new Map<string, string>();
  for (const p of parts) {
    const key = groupKey(p.row.part_group);
    if (key == null) continue;
    if (p.odometer != null) {
      groupMaxOdo.set(key, Math.max(groupMaxOdo.get(key) ?? 0, p.odometer));
    }
    if (p.date && (groupMaxDate.get(key) ?? "") < p.date) {
      groupMaxDate.set(key, p.date);
    }
  }

  const reminderGroupKeys = new Set<string>();
  const reminders: ReminderView[] = (reminderRows ?? []).map((r) => {
    const key = groupKey(r.part_group);
    if (key) reminderGroupKeys.add(key);
    const lastOdo =
      (key ? groupMaxOdo.get(key) : undefined) ?? r.anchor_odo ?? null;
    const lastDate =
      (key ? groupMaxDate.get(key) : undefined) ?? r.anchor_date ?? null;
    const m = computeMaintenance(r.interval_miles, lastOdo, currentOdo);
    return {
      id: r.id,
      label: r.label,
      partGroup: r.part_group,
      category: cat(r.category),
      interval: r.interval_miles,
      status: m.status,
      milesRemaining: m.milesRemaining,
      nextDue: m.nextDue,
      lastOdo,
      lastDate,
      neverServiced: m.neverServiced,
      pct: m.pct,
    };
  });

  const entries: RepairEntry[] = parts.map((p) => {
    const key = groupKey(p.row.part_group);
    return {
      id: p.row.id,
      description: p.row.description,
      category: cat(p.row.category),
      position: p.row.position,
      partGroup: p.row.part_group,
      date: p.date,
      odometer: p.odometer,
      notes: p.notes,
      freshness: computeFreshness(p.odometer, currentOdo, p.date, today),
      receiptCount: receiptCountByService.get(p.row.service_id) ?? 0,
      relatedCount: relatedCount.get(p.row.id) ?? 0,
      hasReminder: key != null && reminderGroupKeys.has(key),
      isPreventative: p.row.is_preventative,
    };
  });

  // Per-category aging: latest positioned part per (group, position) that reads
  // "aging" flags its category.
  const latestPosSeen = new Set<string>();
  const agingCategories = new Set<Category>();
  for (const p of parts) {
    if (!isPosition(p.row.position)) continue;
    const gk = `${groupKey(p.row.part_group) ?? ""}|${p.row.position}`;
    if (latestPosSeen.has(gk)) continue; // parts are newest-first
    latestPosSeen.add(gk);
    if (computeFreshness(p.odometer, currentOdo, p.date, today) === "aging") {
      agingCategories.add(cat(p.row.category));
    }
  }

  const remWorst = new Map<Category, "overdue" | "soon">();
  for (const r of reminders) {
    if (r.status === "overdue") remWorst.set(r.category, "overdue");
    else if (r.status === "soon" && remWorst.get(r.category) !== "overdue") {
      remWorst.set(r.category, "soon");
    }
  }

  const countByCat = new Map<Category, number>();
  for (const p of parts) {
    const c = cat(p.row.category);
    countByCat.set(c, (countByCat.get(c) ?? 0) + 1);
  }

  const categoryCards: CategoryCard[] = CATEGORIES.map((c) => {
    const worst = remWorst.get(c);
    const badge: CategoryCard["badge"] = worst
      ? worst
      : agingCategories.has(c)
        ? "aging"
        : null;
    return { category: c, slug: CATEGORY_SLUG[c], count: countByCat.get(c) ?? 0, badge };
  });

  // Preventative lens summary — items = every active reminder (a recurring
  // countdown) + every preventative part whose stream has no reminder (latest
  // per stream). Badge = worst reminder state across ALL categories.
  const looseStreams = new Set<string>();
  for (const p of parts) {
    if (!p.row.is_preventative) continue;
    const key = groupKey(p.row.part_group);
    if (key != null && reminderGroupKeys.has(key)) continue; // counted as a reminder
    looseStreams.add(key ?? `desc:${p.row.description.trim().toLowerCase()}`);
  }
  const prevBadge: PreventativeSummary["badge"] = reminders.some(
    (r) => r.status === "overdue",
  )
    ? "overdue"
    : reminders.some((r) => r.status === "soon")
      ? "soon"
      : null;
  const preventative: PreventativeSummary = {
    count: reminders.length + looseStreams.size,
    badge: prevBadge,
  };

  const RANK: Record<ReminderView["status"], number> = {
    overdue: 0,
    soon: 1,
    baseline: 2,
    ok: 3,
  };
  const alertReminders = reminders
    .filter((r) => r.status === "overdue" || r.status === "soon")
    .sort((a, b) => {
      const d = RANK[a.status] - RANK[b.status];
      if (d !== 0) return d;
      return (
        (a.milesRemaining ?? Number.POSITIVE_INFINITY) -
        (b.milesRemaining ?? Number.POSITIVE_INFINITY)
      );
    });

  const partGroups = Array.from(
    new Map(
      [
        ...parts.map((p) => p.row.part_group),
        ...(reminderRows ?? []).map((r) => r.part_group),
      ]
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  return {
    currentOdo,
    categoryCards,
    preventative,
    alertReminders,
    entries,
    partGroups,
  };
}

export default async function MaintenancePage() {
  // DEMO MODE: derive the whole maintenance home from the static fake dataset.
  const data = (await isDemoMode()) ? demoMaintenanceHome() : await loadHome();
  return (
    <MaintenanceHome
      currentOdo={data.currentOdo}
      categoryCards={data.categoryCards}
      preventative={data.preventative}
      alertReminders={data.alertReminders}
      entries={data.entries}
      partGroups={data.partGroups}
    />
  );
}
