import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  CATEGORIES,
  CATEGORY_SLUG,
  computeFreshness,
  computeMaintenance,
  currentOdoFromSources,
  groupKey,
  isCategory,
  type Category,
} from "@/lib/dispatch/repair-log";
import { PreventativeView } from "./PreventativeView";
import type {
  PreventativeGroup,
  RepairEntry,
  ReminderView,
} from "../types";

export const metadata: Metadata = {
  title: "Preventative",
  robots: { index: false, follow: false },
};

/**
 * Preventative lens — the cross-cutting "stay-ahead" view. Aggregates every
 * preventative item across ALL mechanical categories: recurring items (with a
 * mileage countdown) plus consumable parts that have no active reminder. Items
 * stay filed under their mechanical home; this page just gathers them, grouped
 * and labelled by that home so you can see which system each belongs to.
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

const STATUS_RANK: Record<ReminderView["status"], number> = {
  overdue: 0,
  soon: 1,
  baseline: 2,
  ok: 3,
};

async function loadPreventative(): Promise<{
  currentOdo: number;
  groups: PreventativeGroup[];
  totalCount: number;
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

  // Loose preventative parts: preventative, NOT covered by a reminder, one row
  // per stream (latest — parts are newest-first).
  const seenStream = new Set<string>();
  const looseByCat = new Map<Category, RepairEntry[]>();
  for (const p of parts) {
    if (!p.row.is_preventative) continue;
    const key = groupKey(p.row.part_group);
    if (key != null && reminderGroupKeys.has(key)) continue; // shown as a reminder
    const stream = key ?? `desc:${p.row.description.trim().toLowerCase()}`;
    if (seenStream.has(stream)) continue;
    seenStream.add(stream);
    const c = cat(p.row.category);
    const entry: RepairEntry = {
      id: p.row.id,
      description: p.row.description,
      category: c,
      position: p.row.position,
      partGroup: p.row.part_group,
      date: p.date,
      odometer: p.odometer,
      notes: p.notes,
      freshness: computeFreshness(p.odometer, currentOdo, p.date, today),
      receiptCount: receiptCountByService.get(p.row.service_id) ?? 0,
      relatedCount: relatedCount.get(p.row.id) ?? 0,
      hasReminder: false,
      isPreventative: true,
    };
    const list = looseByCat.get(c) ?? [];
    list.push(entry);
    looseByCat.set(c, list);
  }

  const remByCat = new Map<Category, ReminderView[]>();
  for (const r of reminders) {
    const list = remByCat.get(r.category) ?? [];
    list.push(r);
    remByCat.set(r.category, list);
  }
  for (const list of remByCat.values()) {
    list.sort((a, b) => {
      const d = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (d !== 0) return d;
      return (
        (a.milesRemaining ?? Number.POSITIVE_INFINITY) -
        (b.milesRemaining ?? Number.POSITIVE_INFINITY)
      );
    });
  }

  const groups: PreventativeGroup[] = [];
  let totalCount = 0;
  for (const c of CATEGORIES) {
    const rem = remByCat.get(c) ?? [];
    const loose = looseByCat.get(c) ?? [];
    if (rem.length + loose.length === 0) continue;
    totalCount += rem.length + loose.length;
    groups.push({
      category: c,
      slug: CATEGORY_SLUG[c],
      reminders: rem,
      looseEntries: loose,
    });
  }

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

  return { currentOdo, groups, totalCount, partGroups };
}

export default async function PreventativePage() {
  const data = await loadPreventative();
  return (
    <PreventativeView
      currentOdo={data.currentOdo}
      groups={data.groups}
      totalCount={data.totalCount}
      partGroups={data.partGroups}
    />
  );
}
