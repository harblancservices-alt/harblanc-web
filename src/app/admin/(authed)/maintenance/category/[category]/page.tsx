import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  CORNER_POSITIONS,
  NON_CORNER_POSITIONS,
  POSITION_LABEL,
  categoryFromSlug,
  computeFreshness,
  computeMaintenance,
  currentOdoFromSources,
  groupKey,
  isPosition,
  type Category,
  type Position,
} from "@/lib/dispatch/repair-log";
import { CategoryView } from "./CategoryView";
import type { CategorySet, RepairEntry, ReminderView, SetSlot } from "../../types";

export const metadata: Metadata = {
  title: "Category",
  robots: { index: false, follow: false },
};

/**
 * Category view — every part in one category. Set-parts are grouped up top
 * (corners inline with freshness), then an all-parts list with in-category
 * search. Money is de-emphasized (no per-row cost).
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

async function loadCategory(category: Category): Promise<{
  entries: RepairEntry[];
  sets: CategorySet[];
  reminders: ReminderView[];
  currentOdo: number;
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
    { data: allGroupRows },
  ] = await Promise.all([
    sb
      .from("repair_entries")
      .select("id, description, position, part_group, category, service_id, created_at, is_preventative")
      .eq("category", category)
      .is("deleted_at", null)
      .returns<PartRow[]>(),
    sb
      .from("repair_services")
      .select("id, service_date, odometer, notes")
      .returns<ServiceRow[]>(),
    sb
      .from("repair_reminders")
      .select("id, label, part_group, category, interval_miles, anchor_odo, anchor_date")
      .eq("category", category)
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
    sb
      .from("repair_entries")
      .select("part_group")
      .is("deleted_at", null)
      .not("part_group", "is", null)
      .returns<{ part_group: string | null }[]>(),
  ]);

  const currentOdo = currentOdoFromSources(odoRows, (serviceRows ?? []).map((s) => s.odometer));
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

  const parts = (partRows ?? []).map((p) => {
    const s = serviceById.get(p.service_id);
    return { row: p, date: s?.service_date ?? null, odometer: s?.odometer ?? null, notes: s?.notes ?? null };
  });
  parts.sort((a, b) => {
    const d = (b.date ?? "").localeCompare(a.date ?? "");
    if (d !== 0) return d;
    return b.row.created_at.localeCompare(a.row.created_at);
  });

  // Group aggregates (for reminder next-due) within this category.
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
    const lastOdo = (key ? groupMaxOdo.get(key) : undefined) ?? r.anchor_odo ?? null;
    const lastDate = (key ? groupMaxDate.get(key) : undefined) ?? r.anchor_date ?? null;
    const m = computeMaintenance(r.interval_miles, lastOdo, currentOdo);
    return {
      id: r.id,
      label: r.label,
      partGroup: r.part_group,
      category,
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
      category,
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

  // Sets — part groups with ≥1 positioned part. Latest part per position →
  // corner slots (parts are newest-first).
  const setLabel = new Map<string, string>();
  const latestByGroupPos = new Map<string, (typeof parts)[number]>();
  const usedSides = new Map<string, Set<Position>>();
  const hasPositioned = new Set<string>();
  for (const p of parts) {
    const key = groupKey(p.row.part_group);
    if (key == null) continue;
    if (!setLabel.has(key) && p.row.part_group) setLabel.set(key, p.row.part_group);
    if (!isPosition(p.row.position)) continue;
    hasPositioned.add(key);
    const gk = `${key}|${p.row.position}`;
    if (!latestByGroupPos.has(gk)) latestByGroupPos.set(gk, p);
    if (NON_CORNER_POSITIONS.includes(p.row.position)) {
      const s = usedSides.get(key) ?? new Set<Position>();
      s.add(p.row.position);
      usedSides.set(key, s);
    }
  }

  const sets: CategorySet[] = [];
  for (const key of hasPositioned) {
    const positions: Position[] = [
      ...CORNER_POSITIONS,
      ...NON_CORNER_POSITIONS.filter((p) => usedSides.get(key)?.has(p)),
    ];
    const slots: SetSlot[] = positions.map((pos) => {
      const p = latestByGroupPos.get(`${key}|${pos}`) ?? null;
      return {
        position: pos,
        label: POSITION_LABEL[pos],
        entry: p
          ? { id: p.row.id, description: p.row.description, date: p.date, odometer: p.odometer }
          : null,
        freshness: p ? computeFreshness(p.odometer, currentOdo, p.date, today) : "original",
      };
    });
    sets.push({ partGroup: setLabel.get(key) ?? key, slots });
  }
  sets.sort((a, b) => a.partGroup.localeCompare(b.partGroup));

  const partGroups = Array.from(
    new Map(
      (allGroupRows ?? [])
        .map((r) => r.part_group)
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  return { entries, sets, reminders, currentOdo, partGroups };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const data = await loadCategory(category);
  return (
    <CategoryView
      category={category}
      entries={data.entries}
      sets={data.sets}
      reminders={data.reminders}
      currentOdo={data.currentOdo}
      partGroups={data.partGroups}
    />
  );
}
