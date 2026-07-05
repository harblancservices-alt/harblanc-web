import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeFreshness,
  currentOdoFromLoads,
  groupKey,
} from "@/lib/dispatch/repair-log";
import { RepairDetail } from "./RepairDetail";
import type {
  EntryLite,
  RelatedView,
  RepairEntryFull,
} from "../types";

export const metadata: Metadata = {
  title: "Repair",
  robots: { index: false, follow: false },
};

/**
 * Repair entry detail. Server component: loads the one repair_entries row, its
 * signed receipts, its related repairs (with freshness badges), the reminder
 * interval for its group (edit prefill), the truck's current odometer, and the
 * lists the shared log-repair modal + attach picker need.
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

async function loadDetail(entryId: string): Promise<{
  entry: RepairEntryFull;
  related: RelatedView[];
  currentOdo: number;
  partGroups: string[];
  allEntries: EntryLite[];
} | null> {
  const sb = createServiceRoleClient();

  const [{ data: entryRow }, { data: odoRows }, { data: allRows }] =
    await Promise.all([
      sb
        .from("repair_entries")
        .select(
          "id, description, odometer, service_date, cost, notes, position, part_group",
        )
        .eq("id", entryId)
        .is("deleted_at", null)
        .maybeSingle<EntryRow>(),
      sb
        .from("loads")
        .select("odo_assigned, odo_loaded, odo_delivered")
        .is("deleted_at", null)
        .returns<OdoRow[]>(),
      sb
        .from("repair_entries")
        .select("id, description, odometer, service_date, cost, position, part_group")
        .is("deleted_at", null)
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .returns<Omit<EntryRow, "notes">[]>(),
    ]);

  if (!entryRow) return null;

  const currentOdo = currentOdoFromLoads(odoRows);
  const today = new Date().toISOString().slice(0, 10);

  // Receipts (signed) + related links + reminder interval for this group.
  const [{ data: attRows }, { data: linkRows }, { data: remRows }] =
    await Promise.all([
      sb
        .from("repair_attachments")
        .select("id, file_path, thumb_path, file_name, content_type")
        .eq("entry_id", entryId)
        .returns<
          {
            id: string;
            file_path: string;
            thumb_path: string | null;
            file_name: string | null;
            content_type: string | null;
          }[]
        >(),
      sb
        .from("repair_links")
        .select("a_id, b_id")
        .or(`a_id.eq.${entryId},b_id.eq.${entryId}`)
        .returns<{ a_id: string; b_id: string }[]>(),
      entryRow.part_group
        ? sb
            .from("repair_reminders")
            .select("interval_miles")
            .ilike("part_group", entryRow.part_group)
            .is("dismissed_at", null)
            .limit(1)
            .maybeSingle<{ interval_miles: number }>()
        : Promise.resolve({ data: null }),
    ]);

  // Sign receipts.
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

  const entry: RepairEntryFull = {
    id: entryRow.id,
    description: entryRow.description,
    odometer: entryRow.odometer,
    date: entryRow.service_date,
    cost: num(entryRow.cost),
    notes: entryRow.notes,
    position: entryRow.position,
    partGroup: entryRow.part_group,
    reminderInterval: remRows?.interval_miles ?? null,
    receipts: atts.map((a) => ({
      id: a.id,
      name: a.file_name ?? "receipt",
      url: signedByPath.get(a.file_path) ?? null,
      isImage: (a.content_type ?? "").startsWith("image/"),
    })),
    relatedIds: [],
  };

  // Related entries with freshness.
  const relatedIds = new Set<string>();
  for (const l of linkRows ?? []) {
    relatedIds.add(l.a_id === entryId ? l.b_id : l.a_id);
  }
  const byId = new Map((allRows ?? []).map((r) => [r.id, r]));
  const related: RelatedView[] = [];
  for (const id of relatedIds) {
    const r = byId.get(id);
    if (!r) continue;
    related.push({
      id: r.id,
      description: r.description,
      date: r.service_date,
      odometer: r.odometer,
      position: r.position,
      partGroup: r.part_group,
      cost: num(r.cost),
      freshness: computeFreshness(r.odometer, currentOdo, r.service_date, today),
    });
  }
  related.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

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

  return { entry, related, currentOdo, partGroups, allEntries };
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
      currentOdo={data.currentOdo}
      partGroups={data.partGroups}
      allEntries={data.allEntries}
    />
  );
}
