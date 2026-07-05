import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeFreshness,
  currentOdoFromLoads,
  groupKey,
  isCategory,
  type Category,
} from "@/lib/dispatch/repair-log";
import { RepairDetail } from "./RepairDetail";
import type {
  EntryLite,
  RelatedView,
  RepairEntryFull,
  ServiceFull,
  ServiceFormPart,
} from "../types";

export const metadata: Metadata = {
  title: "Repair",
  robots: { index: false, follow: false },
};

/**
 * Part detail — one part, its parent service (visit), the other parts replaced
 * in that same visit, its freshness, and its related-repair links.
 */

type PartRow = {
  id: string;
  description: string;
  position: string | null;
  part_group: string | null;
  category: string;
  service_id: string;
};

type ServiceRow = {
  id: string;
  service_date: string | null;
  odometer: number | null;
  shop: string | null;
  total_cost: number | string | null;
  notes: string | null;
};

type OdoRow = {
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
};

const RECEIPT_BUCKET = "maintenance-receipts";

function num(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cat(v: string): Category {
  return isCategory(v) ? v : "Other";
}

async function loadDetail(entryId: string): Promise<{
  entry: RepairEntryFull;
  related: RelatedView[];
  service: ServiceFull;
  currentOdo: number;
  partGroups: string[];
  allEntries: EntryLite[];
} | null> {
  const sb = createServiceRoleClient();

  const [
    { data: allParts },
    { data: allServices },
    { data: remRows },
    { data: odoRows },
    { data: linkRows },
  ] = await Promise.all([
    sb
      .from("repair_entries")
      .select("id, description, position, part_group, category, service_id")
      .is("deleted_at", null)
      .returns<PartRow[]>(),
    sb
      .from("repair_services")
      .select("id, service_date, odometer, shop, total_cost, notes")
      .returns<ServiceRow[]>(),
    sb
      .from("repair_reminders")
      .select("part_group, interval_miles")
      .is("dismissed_at", null)
      .returns<{ part_group: string; interval_miles: number }[]>(),
    sb
      .from("loads")
      .select("odo_assigned, odo_loaded, odo_delivered")
      .is("deleted_at", null)
      .returns<OdoRow[]>(),
    sb
      .from("repair_links")
      .select("a_id, b_id")
      .or(`a_id.eq.${entryId},b_id.eq.${entryId}`)
      .returns<{ a_id: string; b_id: string }[]>(),
  ]);

  const partById = new Map((allParts ?? []).map((p) => [p.id, p]));
  const focused = partById.get(entryId);
  if (!focused) return null;

  const serviceById = new Map((allServices ?? []).map((s) => [s.id, s]));
  const svc = serviceById.get(focused.service_id) ?? null;
  const currentOdo = currentOdoFromLoads(odoRows);
  const today = new Date().toISOString().slice(0, 10);

  const reminderInterval = new Map<string, number>();
  for (const r of remRows ?? []) {
    const key = groupKey(r.part_group);
    if (key && !reminderInterval.has(key)) reminderInterval.set(key, r.interval_miles);
  }
  const intervalFor = (pg: string | null) => {
    const key = groupKey(pg);
    return key ? (reminderInterval.get(key) ?? null) : null;
  };

  const svcDate = svc?.service_date ?? null;
  const svcOdo = svc?.odometer ?? null;

  // Receipts for this service (signed).
  const { data: attRows } = await sb
    .from("repair_attachments")
    .select("id, file_path, file_name, content_type")
    .eq("service_id", focused.service_id)
    .returns<
      { id: string; file_path: string; file_name: string | null; content_type: string | null }[]
    >();
  const atts = attRows ?? [];
  const signedByPath = new Map<string, string>();
  if (atts.length > 0) {
    const { data: signedList } = await sb.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrls(atts.map((a) => a.file_path), 3600);
    for (const s of signedList ?? []) {
      if (s.path && s.signedUrl && !s.error) signedByPath.set(s.path, s.signedUrl);
    }
  }
  const receipts = atts.map((a) => ({
    id: a.id,
    name: a.file_name ?? "receipt",
    url: signedByPath.get(a.file_path) ?? null,
    isImage: (a.content_type ?? "").startsWith("image/"),
  }));

  const serviceView = {
    id: focused.service_id,
    date: svcDate,
    odometer: svcOdo,
    shop: svc?.shop ?? null,
    totalCost: num(svc?.total_cost ?? null),
    notes: svc?.notes ?? null,
    receipts,
  };

  // Sibling parts in the same visit.
  const siblingParts = (allParts ?? []).filter(
    (p) => p.service_id === focused.service_id,
  );
  const otherParts = siblingParts
    .filter((p) => p.id !== entryId)
    .map((p) => ({
      id: p.id,
      description: p.description,
      category: cat(p.category),
      position: p.position,
    }));

  const entry: RepairEntryFull = {
    id: focused.id,
    description: focused.description,
    category: cat(focused.category),
    position: focused.position,
    partGroup: focused.part_group,
    reminderInterval: intervalFor(focused.part_group),
    freshness: computeFreshness(svcOdo, currentOdo, svcDate, today),
    service: serviceView,
    otherParts,
  };

  // Full service for the edit form (all its parts + their reminder intervals).
  const service: ServiceFull = {
    id: focused.service_id,
    date: svcDate,
    odometer: svcOdo,
    shop: svc?.shop ?? null,
    totalCost: num(svc?.total_cost ?? null),
    notes: svc?.notes ?? null,
    receipts,
    parts: siblingParts.map(
      (p): ServiceFormPart => ({
        id: p.id,
        description: p.description,
        category: cat(p.category),
        position: p.position,
        partGroup: p.part_group,
        reminderInterval: intervalFor(p.part_group),
      }),
    ),
  };

  // Related parts (with freshness from their own services).
  const relatedIds = new Set<string>();
  for (const l of linkRows ?? []) {
    relatedIds.add(l.a_id === entryId ? l.b_id : l.a_id);
  }
  const related: RelatedView[] = [];
  for (const id of relatedIds) {
    const p = partById.get(id);
    if (!p) continue;
    const s = serviceById.get(p.service_id);
    const d = s?.service_date ?? null;
    const o = s?.odometer ?? null;
    related.push({
      id: p.id,
      description: p.description,
      date: d,
      odometer: o,
      position: p.position,
      partGroup: p.part_group,
      freshness: computeFreshness(o, currentOdo, d, today),
    });
  }
  related.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const allEntries: EntryLite[] = (allParts ?? []).map((p) => {
    const s = serviceById.get(p.service_id);
    return {
      id: p.id,
      description: p.description,
      date: s?.service_date ?? null,
      odometer: s?.odometer ?? null,
      position: p.position,
      partGroup: p.part_group,
    };
  });

  const partGroups = Array.from(
    new Map(
      (allParts ?? [])
        .map((p) => p.part_group)
        .filter((g): g is string => !!g && g.trim().length > 0)
        .map((g) => [groupKey(g)!, g] as const),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  return { entry, related, service, currentOdo, partGroups, allEntries };
}

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadDetail(id);
  if (!data) notFound();

  return (
    <RepairDetail
      entry={data.entry}
      related={data.related}
      service={data.service}
      currentOdo={data.currentOdo}
      partGroups={data.partGroups}
      allEntries={data.allEntries}
    />
  );
}
