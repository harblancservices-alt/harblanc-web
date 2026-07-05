import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  CORNER_POSITIONS,
  POSITION_LABEL,
  computeFreshness,
  currentOdoFromLoads,
  groupKey,
  isPosition,
  type Position,
} from "@/lib/dispatch/repair-log";
import { SetView } from "./SetView";
import type { EntryLite, SetSlot } from "../../types";

export const metadata: Metadata = {
  title: "Set",
  robots: { index: false, follow: false },
};

/**
 * Set-part view — the 2×2 corners grid for a positioned part group (e.g. wheel
 * bearings). Each corner shows its latest entry's freshness + last-done line;
 * the combined cost sums every entry in the group.
 */

type EntryRow = {
  id: string;
  description: string;
  odometer: number | null;
  service_date: string | null;
  cost: number | string | null;
  position: string | null;
  part_group: string | null;
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

async function loadSet(groupParam: string): Promise<{
  label: string;
  currentOdo: number;
  slots: SetSlot[];
  combinedCost: number;
  entries: {
    id: string;
    description: string;
    date: string | null;
    odometer: number | null;
    cost: number | null;
    position: string | null;
  }[];
  partGroups: string[];
  allEntries: EntryLite[];
} | null> {
  const sb = createServiceRoleClient();

  const [{ data: groupRows }, { data: odoRows }, { data: allRows }] =
    await Promise.all([
      sb
        .from("repair_entries")
        .select(
          "id, description, odometer, service_date, cost, position, part_group",
        )
        .is("deleted_at", null)
        .ilike("part_group", groupParam)
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .returns<EntryRow[]>(),
      sb
        .from("loads")
        .select("odo_assigned, odo_loaded, odo_delivered")
        .is("deleted_at", null)
        .returns<OdoRow[]>(),
      sb
        .from("repair_entries")
        .select("id, description, odometer, service_date, position, part_group")
        .is("deleted_at", null)
        .order("service_date", { ascending: false, nullsFirst: false })
        .returns<Omit<EntryRow, "cost">[]>(),
    ]);

  const rows = groupRows ?? [];
  if (rows.length === 0) return null;

  const label = rows.find((r) => r.part_group)?.part_group ?? groupParam;
  const currentOdo = currentOdoFromLoads(odoRows);
  const today = new Date().toISOString().slice(0, 10);

  // Latest entry per position (rows are already newest-first).
  const latestByPos = new Map<string, EntryRow>();
  const usedSides = new Set<string>();
  for (const r of rows) {
    if (!isPosition(r.position)) continue;
    if (!latestByPos.has(r.position)) latestByPos.set(r.position, r);
    if (r.position === "L" || r.position === "R") usedSides.add(r.position);
  }

  // Always show the 4 corners; add L/R only if the set actually uses them.
  const slotPositions: Position[] = [
    ...CORNER_POSITIONS,
    ...(["L", "R"] as Position[]).filter((p) => usedSides.has(p)),
  ];

  const slots: SetSlot[] = slotPositions.map((p) => {
    const r = latestByPos.get(p) ?? null;
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

  const combinedCost = rows.reduce((s, r) => s + (num(r.cost) ?? 0), 0);
  const entries = rows.map((r) => ({
    id: r.id,
    description: r.description,
    date: r.service_date,
    odometer: r.odometer,
    cost: num(r.cost),
    position: r.position,
  }));

  const partGroups = Array.from(
    new Map(
      (allRows ?? [])
        .map((r) => r.part_group)
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  const allEntries: EntryLite[] = (allRows ?? []).map((r) => ({
    id: r.id,
    description: r.description,
    date: r.service_date,
    odometer: r.odometer,
    position: r.position,
    partGroup: r.part_group,
  }));

  return {
    label,
    currentOdo,
    slots,
    combinedCost,
    entries,
    partGroups,
    allEntries,
  };
}

export default async function SetPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = await params;
  const decoded = decodeURIComponent(group);
  const data = await loadSet(decoded);
  if (!data) notFound();

  return (
    <SetView
      label={data.label}
      currentOdo={data.currentOdo}
      slots={data.slots}
      combinedCost={data.combinedCost}
      entries={data.entries}
      partGroups={data.partGroups}
      allEntries={data.allEntries}
    />
  );
}
