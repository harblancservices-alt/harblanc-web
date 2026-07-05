import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  CORNER_POSITIONS,
  POSITION_LABEL,
  categoryFromSlug,
  computeFreshness,
  computeMaintenance,
  currentOdoFromLoads,
  groupKey,
  isPosition,
  type Category,
  type Position,
} from "@/lib/dispatch/repair-log";
import { CategoryView } from "./CategoryView";
import type {
  CategorySet,
  EntryLite,
  RepairEntry,
  ReminderView,
  SetSlot,
} from "../../types";

export const metadata: Metadata = {
  title: "Category",
  robots: { index: false, follow: false },
};

/**
 * Category view — every repair in one category, with its set-parts grouped up
 * top (corners inline with freshness + combined cost) and an all-repairs list
 * with a within-category search.
 */

type EntryRow = {
  id: string;
  description: string;
  odometer: number | null;
  service_date: string | null;
  cost: number | string | null;
  notes: string | null;
  position: string | null;
  part_group: string | null;
  category: string;
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

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadCategory(category: Category): Promise<{
  entries: RepairEntry[];
  sets: CategorySet[];
  reminders: ReminderView[];
  lifetime: number;
  currentOdo: number;
  partGroups: string[];
  allEntries: EntryLite[];
}> {
  const sb = createServiceRoleClient();

  const [
    { data: entryRows },
    { data: reminderRows },
    { data: odoRows },
    { data: attRows },
    { data: linkRows },
    { data: allRows },
  ] = await Promise.all([
    sb
      .from("repair_entries")
      .select(
        "id, description, odometer, service_date, cost, notes, position, part_group, category",
      )
      .eq("category", category)
      .is("deleted_at", null)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .returns<EntryRow[]>(),
    sb
      .from("repair_reminders")
      .select(
        "id, label, part_group, category, interval_miles, anchor_odo, anchor_date",
      )
      .eq("category", category)
      .is("dismissed_at", null)
      .returns<ReminderRow[]>(),
    sb
      .from("loads")
      .select("odo_assigned, odo_loaded, odo_delivered")
      .is("deleted_at", null)
      .returns<OdoRow[]>(),
    sb.from("repair_attachments").select("entry_id").returns<{ entry_id: string }[]>(),
    sb
      .from("repair_links")
      .select("a_id, b_id")
      .returns<{ a_id: string; b_id: string }[]>(),
    // Lightweight list of every entry, for the shared modal's attach picker +
    // part-group datalist (attach can span categories).
    sb
      .from("repair_entries")
      .select("id, description, service_date, odometer, position, part_group")
      .is("deleted_at", null)
      .order("service_date", { ascending: false, nullsFirst: false })
      .returns<
        {
          id: string;
          description: string;
          service_date: string | null;
          odometer: number | null;
          position: string | null;
          part_group: string | null;
        }[]
      >(),
  ]);

  const rows = entryRows ?? [];
  const currentOdo = currentOdoFromLoads(odoRows);
  const today = new Date().toISOString().slice(0, 10);

  const receiptCount = new Map<string, number>();
  for (const a of attRows ?? []) {
    receiptCount.set(a.entry_id, (receiptCount.get(a.entry_id) ?? 0) + 1);
  }
  const relatedCount = new Map<string, number>();
  for (const l of linkRows ?? []) {
    relatedCount.set(l.a_id, (relatedCount.get(l.a_id) ?? 0) + 1);
    relatedCount.set(l.b_id, (relatedCount.get(l.b_id) ?? 0) + 1);
  }

  // Group aggregates (for reminder next-due) within this category.
  const groupMaxOdo = new Map<string, number>();
  const groupMaxDate = new Map<string, string>();
  for (const r of rows) {
    const key = groupKey(r.part_group);
    if (key == null) continue;
    if (r.odometer != null) {
      groupMaxOdo.set(key, Math.max(groupMaxOdo.get(key) ?? 0, r.odometer));
    }
    if (r.service_date && (groupMaxDate.get(key) ?? "") < r.service_date) {
      groupMaxDate.set(key, r.service_date);
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

  const entries: RepairEntry[] = rows.map((r) => {
    const key = groupKey(r.part_group);
    return {
      id: r.id,
      description: r.description,
      date: r.service_date,
      odometer: r.odometer,
      position: r.position,
      partGroup: r.part_group,
      cost: num(r.cost),
      notes: r.notes,
      category,
      freshness: computeFreshness(r.odometer, currentOdo, r.service_date, today),
      receiptCount: receiptCount.get(r.id) ?? 0,
      relatedCount: relatedCount.get(r.id) ?? 0,
      hasReminder: key != null && reminderGroupKeys.has(key),
    };
  });

  // Sets — part groups with ≥1 positioned entry. Latest entry per position →
  // corner slots (rows are newest-first); combined cost sums the whole group.
  const setLabel = new Map<string, string>();
  const latestByGroupPos = new Map<string, EntryRow>();
  const usedSides = new Map<string, Set<Position>>();
  const combinedByGroup = new Map<string, number>();
  const hasPositioned = new Set<string>();
  for (const r of rows) {
    const key = groupKey(r.part_group);
    if (key == null) continue;
    if (!setLabel.has(key) && r.part_group) setLabel.set(key, r.part_group);
    combinedByGroup.set(key, (combinedByGroup.get(key) ?? 0) + (num(r.cost) ?? 0));
    if (!isPosition(r.position)) continue;
    hasPositioned.add(key);
    const gk = `${key}|${r.position}`;
    if (!latestByGroupPos.has(gk)) latestByGroupPos.set(gk, r);
    if (r.position === "L" || r.position === "R") {
      const s = usedSides.get(key) ?? new Set<Position>();
      s.add(r.position);
      usedSides.set(key, s);
    }
  }

  const sets: CategorySet[] = [];
  for (const key of hasPositioned) {
    const positions: Position[] = [
      ...CORNER_POSITIONS,
      ...(["L", "R"] as Position[]).filter((p) => usedSides.get(key)?.has(p)),
    ];
    const slots: SetSlot[] = positions.map((p) => {
      const r = latestByGroupPos.get(`${key}|${p}`) ?? null;
      return {
        position: p,
        label: POSITION_LABEL[p],
        entry: r
          ? {
              id: r.id,
              description: r.description,
              date: r.service_date,
              odometer: r.odometer,
              cost: num(r.cost),
            }
          : null,
        freshness: r
          ? computeFreshness(r.odometer, currentOdo, r.service_date, today)
          : "original",
      };
    });
    sets.push({
      partGroup: setLabel.get(key) ?? key,
      slots,
      combinedCost: combinedByGroup.get(key) ?? 0,
    });
  }
  sets.sort((a, b) => a.partGroup.localeCompare(b.partGroup));

  const lifetime = rows.reduce((s, r) => s + (num(r.cost) ?? 0), 0);

  const allEntries: EntryLite[] = (allRows ?? []).map((r) => ({
    id: r.id,
    description: r.description,
    date: r.service_date,
    odometer: r.odometer,
    position: r.position,
    partGroup: r.part_group,
  }));

  const partGroups = Array.from(
    new Map(
      (allRows ?? [])
        .map((r) => r.part_group)
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  return {
    entries,
    sets,
    reminders,
    lifetime,
    currentOdo,
    partGroups,
    allEntries,
  };
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
      lifetime={data.lifetime}
      currentOdo={data.currentOdo}
      partGroups={data.partGroups}
      allEntries={data.allEntries}
    />
  );
}
