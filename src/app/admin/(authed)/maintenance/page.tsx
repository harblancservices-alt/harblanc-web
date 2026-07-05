import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RepairLogView } from "./RepairLogView";
import {
  computeMaintenance,
  currentOdoFromLoads,
  groupKey,
  isPosition,
} from "@/lib/dispatch/repair-log";
import type {
  CostRollups,
  EntryLite,
  RepairEntry,
  ReminderView,
  SetSummary,
} from "./types";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

/**
 * Maintenance — the truck's repair log (2018 Ram 2500 6.7L Cummins).
 *
 * Server component. Loads the flat repair_entries, the reminder overlay, and
 * the truck's current odometer (highest reading across non-deleted loads),
 * derives each reminder's status, the cost rollups, and the set summaries, then
 * hands plain data to the client view. Service-role client, same posture as the
 * loads page.
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
};

type ReminderRow = {
  id: string;
  label: string;
  part_group: string;
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

/** Most-recent-first: latest odometer / date across a group's entries. */
type GroupAgg = { maxOdo: number | null; maxDate: string | null; cost: number };

async function loadRepairLog(): Promise<{
  currentOdo: number;
  entries: RepairEntry[];
  reminders: ReminderView[];
  rollups: CostRollups;
  sets: SetSummary[];
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
  ] = await Promise.all([
    sb
      .from("repair_entries")
      .select(
        "id, description, odometer, service_date, cost, notes, position, part_group",
      )
      .is("deleted_at", null)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .returns<EntryRow[]>(),
    sb
      .from("repair_reminders")
      .select("id, label, part_group, interval_miles, anchor_odo, anchor_date")
      .is("dismissed_at", null)
      .returns<ReminderRow[]>(),
    sb
      .from("loads")
      .select("odo_assigned, odo_loaded, odo_delivered")
      .is("deleted_at", null)
      .returns<OdoRow[]>(),
    sb
      .from("repair_attachments")
      .select("entry_id")
      .returns<{ entry_id: string }[]>(),
    sb
      .from("repair_links")
      .select("a_id, b_id")
      .returns<{ a_id: string; b_id: string }[]>(),
  ]);

  const currentOdo = currentOdoFromLoads(odoRows);
  const rows = entryRows ?? [];

  // Receipt + related counts per entry.
  const receiptCount = new Map<string, number>();
  for (const a of attRows ?? []) {
    receiptCount.set(a.entry_id, (receiptCount.get(a.entry_id) ?? 0) + 1);
  }
  const relatedCount = new Map<string, number>();
  for (const l of linkRows ?? []) {
    relatedCount.set(l.a_id, (relatedCount.get(l.a_id) ?? 0) + 1);
    relatedCount.set(l.b_id, (relatedCount.get(l.b_id) ?? 0) + 1);
  }

  // Aggregate entries by group key (latest odo/date + combined cost).
  const groups = new Map<string, GroupAgg>();
  const groupLabel = new Map<string, string>();
  const positionsByGroup = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = groupKey(r.part_group);
    if (key == null) continue;
    if (!groupLabel.has(key) && r.part_group) groupLabel.set(key, r.part_group);
    const g = groups.get(key) ?? { maxOdo: null, maxDate: null, cost: 0 };
    const odo = r.odometer;
    if (odo != null && (g.maxOdo == null || odo > g.maxOdo)) g.maxOdo = odo;
    if (r.service_date && (g.maxDate == null || r.service_date > g.maxDate)) {
      g.maxDate = r.service_date;
    }
    g.cost += num(r.cost) ?? 0;
    groups.set(key, g);
    if (isPosition(r.position)) {
      const set = positionsByGroup.get(key) ?? new Set<string>();
      set.add(r.position);
      positionsByGroup.set(key, set);
    }
  }

  // Reminders → computed status. next-due uses the group's latest entry
  // odometer, falling back to the reminder's anchor baseline.
  const reminderGroupKeys = new Set<string>();
  const reminders: ReminderView[] = (reminderRows ?? []).map((r) => {
    const key = groupKey(r.part_group);
    if (key) reminderGroupKeys.add(key);
    const g = key ? groups.get(key) : undefined;
    const lastOdo = g?.maxOdo ?? r.anchor_odo ?? null;
    const lastDate = g?.maxDate ?? r.anchor_date ?? null;
    const m = computeMaintenance(r.interval_miles, lastOdo, currentOdo);
    return {
      id: r.id,
      label: r.label,
      partGroup: r.part_group,
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
  // Surface overdue → due soon → no-baseline → ok, most-urgent first.
  const RANK: Record<ReminderView["status"], number> = {
    overdue: 0,
    soon: 1,
    baseline: 2,
    ok: 3,
  };
  reminders.sort((a, b) => {
    const r = RANK[a.status] - RANK[b.status];
    if (r !== 0) return r;
    return (
      (a.milesRemaining ?? Number.POSITIVE_INFINITY) -
      (b.milesRemaining ?? Number.POSITIVE_INFINITY)
    );
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
      receiptCount: receiptCount.get(r.id) ?? 0,
      relatedCount: relatedCount.get(r.id) ?? 0,
      hasReminder: key != null && reminderGroupKeys.has(key),
    };
  });

  const allEntries: EntryLite[] = rows.map((r) => ({
    id: r.id,
    description: r.description,
    date: r.service_date,
    odometer: r.odometer,
    position: r.position,
    partGroup: r.part_group,
  }));

  // Cost rollups — month / YTD / lifetime by service_date (string compare on
  // the YYYY-MM / YYYY prefix, timezone-safe).
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yr = String(now.getFullYear());
  const rollups: CostRollups = { month: 0, ytd: 0, lifetime: 0 };
  for (const r of rows) {
    const c = num(r.cost) ?? 0;
    if (c === 0) continue;
    rollups.lifetime += c;
    const d = r.service_date ?? "";
    if (d.startsWith(yr)) rollups.ytd += c;
    if (d.startsWith(ym)) rollups.month += c;
  }

  // Sets — groups with at least one positioned entry.
  const sets: SetSummary[] = [];
  for (const [key, positions] of positionsByGroup) {
    const g = groups.get(key);
    sets.push({
      partGroup: groupLabel.get(key) ?? key,
      positions: positions.size,
      combinedCost: g?.cost ?? 0,
    });
  }
  sets.sort((a, b) => a.partGroup.localeCompare(b.partGroup));

  // Distinct part-group labels for the form datalist.
  const partGroups = Array.from(
    new Map(
      [
        ...rows.map((r) => r.part_group),
        ...(reminderRows ?? []).map((r) => r.part_group),
      ]
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  return {
    currentOdo,
    entries,
    reminders,
    rollups,
    sets,
    partGroups,
    allEntries,
  };
}

export default async function MaintenancePage() {
  const data = await loadRepairLog();
  return (
    <RepairLogView
      currentOdo={data.currentOdo}
      entries={data.entries}
      reminders={data.reminders}
      rollups={data.rollups}
      sets={data.sets}
      partGroups={data.partGroups}
      allEntries={data.allEntries}
    />
  );
}
