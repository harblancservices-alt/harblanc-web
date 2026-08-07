import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  CORNER_POSITIONS,
  NON_CORNER_POSITIONS,
  POSITION_LABEL,
  computeFreshness,
  currentOdoFromSources,
  groupKey,
  isCategory,
  isPosition,
  type Category,
  type Position,
} from "@/lib/dispatch/repair-log";
import { SetView } from "./SetView";
import type { SetSlot } from "../../types";

export const metadata: Metadata = {
  title: "Set",
  robots: { index: false, follow: false },
};

/**
 * Set-part view — the 2×2 corners grid for a positioned part group (e.g. wheel
 * bearings). Each corner shows its latest part's freshness + last-done line.
 * Money de-emphasized (no combined cost).
 */

type PartRow = {
  id: string;
  description: string;
  position: string | null;
  part_group: string | null;
  category: string;
  service_id: string;
  created_at: string;
};

type ServiceRow = {
  id: string;
  service_date: string | null;
  odometer: number | null;
};

type OdoRow = {
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
};

async function loadSet(groupParam: string): Promise<{
  label: string;
  category: Category;
  currentOdo: number;
  slots: SetSlot[];
  entries: {
    id: string;
    description: string;
    date: string | null;
    odometer: number | null;
    position: string | null;
  }[];
  partGroups: string[];
} | null> {
  const sb = createServiceRoleClient();

  const [{ data: partRows }, { data: serviceRows }, { data: odoRows }, { data: allGroupRows }] =
    await Promise.all([
      sb
        .from("repair_entries")
        .select("id, description, position, part_group, category, service_id, created_at")
        .is("deleted_at", null)
        .ilike("part_group", groupParam)
        .returns<PartRow[]>(),
      sb
        .from("repair_services")
        .select("id, service_date, odometer")
        .returns<ServiceRow[]>(),
      sb
        .from("loads")
        .select("odo_assigned, odo_loaded, odo_delivered")
        .is("deleted_at", null)
        .returns<OdoRow[]>(),
      sb
        .from("repair_entries")
        .select("part_group")
        .is("deleted_at", null)
        .not("part_group", "is", null)
        .returns<{ part_group: string | null }[]>(),
    ]);

  const rawParts = partRows ?? [];
  if (rawParts.length === 0) return null;

  const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));
  const parts = rawParts.map((p) => {
    const s = serviceById.get(p.service_id);
    return { row: p, date: s?.service_date ?? null, odometer: s?.odometer ?? null };
  });
  parts.sort((a, b) => {
    const d = (b.date ?? "").localeCompare(a.date ?? "");
    if (d !== 0) return d;
    return b.row.created_at.localeCompare(a.row.created_at);
  });

  const label = rawParts.find((r) => r.part_group)?.part_group ?? groupParam;
  const currentOdo = currentOdoFromSources(odoRows, (serviceRows ?? []).map((s) => s.odometer));
  const today = new Date().toISOString().slice(0, 10);

  // Dominant category (presets the "Log a part" form).
  const catCounts = new Map<Category, number>();
  for (const p of parts) {
    if (isCategory(p.row.category)) {
      catCounts.set(p.row.category, (catCounts.get(p.row.category) ?? 0) + 1);
    }
  }
  let category: Category = "Other";
  let best = -1;
  for (const [c, n] of catCounts) {
    if (n > best) {
      best = n;
      category = c;
    }
  }

  // Latest part per position (parts are newest-first).
  const latestByPos = new Map<string, (typeof parts)[number]>();
  const usedSides = new Set<Position>();
  for (const p of parts) {
    if (!isPosition(p.row.position)) continue;
    if (!latestByPos.has(p.row.position)) latestByPos.set(p.row.position, p);
    if (NON_CORNER_POSITIONS.includes(p.row.position)) usedSides.add(p.row.position);
  }

  const slotPositions: Position[] = [
    ...CORNER_POSITIONS,
    ...NON_CORNER_POSITIONS.filter((p) => usedSides.has(p)),
  ];
  const slots: SetSlot[] = slotPositions.map((pos) => {
    const p = latestByPos.get(pos) ?? null;
    return {
      position: pos,
      label: POSITION_LABEL[pos],
      entry: p
        ? { id: p.row.id, description: p.row.description, date: p.date, odometer: p.odometer }
        : null,
      freshness: p ? computeFreshness(p.odometer, currentOdo, p.date, today) : "original",
    };
  });

  const entries = parts.map((p) => ({
    id: p.row.id,
    description: p.row.description,
    date: p.date,
    odometer: p.odometer,
    position: p.row.position,
  }));

  const partGroups = Array.from(
    new Map(
      (allGroupRows ?? [])
        .map((r) => r.part_group)
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  return { label, category, currentOdo, slots, entries, partGroups };
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
      category={data.category}
      currentOdo={data.currentOdo}
      slots={data.slots}
      entries={data.entries}
      partGroups={data.partGroups}
    />
  );
}
