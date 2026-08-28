/**
 * Typed query module for the repair/maintenance log (`repair_entries`,
 * `repair_services`, `repair_reminders`, `repair_attachments`,
 * `repair_links` — v2-architecture.md §3c, §4). Phase 4b, READ-ONLY.
 *
 * Scope note: this module talks to Supabase directly rather than going
 * through the shared `DataSource` (v2-architecture.md §10), matching the
 * precedent already set by `lib/data/recurring-expenses.ts` — multiple
 * other /tms-v2 screens are being built concurrently against
 * `lib/demo/{data-source,live-data-source,demo-data-source}.ts` and the
 * shared nav/UI-kit files in this same phase; touching those here would
 * risk stepping on that work mid-flight. Routing this entity through
 * `DataSource` properly is deferred, not silently skipped.
 *
 * Business logic (freshness, due/overdue thresholds, category matching,
 * part-group keying) is REUSED verbatim from `lib/dispatch/{repair-log,
 * maintenance}.ts` — the same audited-correct source of truth `/admin`'s
 * Maintenance cluster already uses — rather than re-derived a second time.
 *
 * Query shape improves on `/admin`'s cluster (audit §21: five near-identical
 * loaders, each reading the full `repair_entries`/`loads` tables) without
 * changing any business rule: the current odometer is read via three
 * bounded `order+limit(1)` queries instead of a full unfiltered `loads`
 * scan, reminders resolve their last-serviced date/odometer from only the
 * entries whose `part_group` they reference (not every part ever logged),
 * and "recent repair log" is a real bounded, ordered query from the start.
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { centralDateKey } from "@/lib/domain/dates";
import {
  computeFreshness,
  groupKey,
  isCategory,
  type Category,
  type Freshness,
} from "@/lib/dispatch/repair-log";
import { computeMaintenance, type MaintStatus } from "@/lib/dispatch/maintenance";
import { CANONICAL_SERVICE_TYPES, slugify } from "@/lib/dispatch/service-types";

export type { Category, Freshness, MaintStatus };

type SB = ReturnType<typeof createServiceRoleClient>;

const RECEIPT_BUCKET = "maintenance-receipts";
const RECENT_ENTRIES_LIMIT = 20;

function cat(v: string | null | undefined): Category {
  return isCategory(v) ? v : "Other";
}

// ---------------------------------------------------------------------------
// Current odometer — the highest reading across BOTH loads' three odometer
// columns AND logged maintenance/service odometers (repair_services.
// odometer), via one bounded order+limit(1) query per source instead of
// pulling every row to compute a client-side max. A service can be logged
// at a higher reading than any load has recorded (e.g. a shop visit
// between loads), so loads-only under-counts — this is the same
// currentOdoFromSources() rule src/lib/dispatch/maintenance.ts's row-array
// version applies, expressed as bounded queries to match this module's own
// query-shape discipline (see its header comment).

async function fetchCurrentOdo(sb: SB): Promise<number> {
  const loadColumns = ["odo_assigned", "odo_loaded", "odo_delivered"] as const;
  const [loadMaxes, serviceMax] = await Promise.all([
    Promise.all(
      loadColumns.map(async (col) => {
        const { data } = await sb
          .from("loads")
          .select(col)
          .is("deleted_at", null)
          .not(col, "is", null)
          .order(col, { ascending: false })
          .limit(1)
          .maybeSingle<Record<string, number | null>>();
        return data?.[col] ?? 0;
      }),
    ),
    sb
      .from("repair_services")
      .select("odometer")
      .not("odometer", "is", null)
      .order("odometer", { ascending: false })
      .limit(1)
      .maybeSingle<{ odometer: number | null }>()
      .then(({ data }) => data?.odometer ?? 0),
  ]);
  return Math.max(0, ...loadMaxes, serviceMax);
}

// ---------------------------------------------------------------------------
// Overview: reminders + current odometer + recent repair log entries.

export type MaintenanceReminder = {
  id: string;
  label: string;
  partGroup: string;
  category: Category;
  intervalMiles: number;
  status: MaintStatus;
  milesRemaining: number | null;
  nextDue: number | null;
  lastOdo: number | null;
  lastDate: string | null;
  neverServiced: boolean;
  /** 0-100 through the interval, for the progress bar. */
  pct: number;
};

export type RecentRepairEntry = {
  id: string;
  description: string;
  category: Category;
  position: string | null;
  partGroup: string | null;
  date: string | null;
  odometer: number | null;
  freshness: Freshness | null;
  receiptCount: number;
};

export type DismissedReminder = {
  id: string;
  label: string;
  partGroup: string;
  category: Category;
  intervalMiles: number;
  dismissedAt: string;
};

export type MaintenanceOverview = {
  currentOdo: number;
  /** Every active (non-dismissed) reminder, worst-status first. */
  reminders: MaintenanceReminder[];
  /** Most recently logged parts, newest first. */
  recentEntries: RecentRepairEntry[];
  /** Dismissed reminders, most-recently-dismissed first — the un-dismiss
   * surface (QA gap: setReminderDismissed(id, false) already worked
   * end-to-end, there was just nowhere to see a dismissed reminder to
   * bring it back). */
  dismissedReminders: DismissedReminder[];
};

const STATUS_RANK: Record<MaintStatus, number> = { overdue: 0, soon: 1, baseline: 2, ok: 3 };

type ReminderRow = {
  id: string;
  label: string;
  part_group: string;
  category: string;
  interval_miles: number;
  anchor_odo: number | null;
  anchor_date: string | null;
};

type ServiceLite = { id: string; service_date: string | null; odometer: number | null };

async function fetchReminders(sb: SB, currentOdo: number): Promise<MaintenanceReminder[]> {
  const { data: reminderRows } = await sb
    .from("repair_reminders")
    .select("id, label, part_group, category, interval_miles, anchor_odo, anchor_date")
    .is("dismissed_at", null)
    .returns<ReminderRow[]>();
  const reminders = reminderRows ?? [];
  if (reminders.length === 0) return [];

  // Only the entries whose part_group a reminder actually references — not
  // every part ever logged (the audit-flagged full-scan pattern).
  const partGroups = [...new Set(reminders.map((r) => r.part_group))];
  const { data: entryRows } = await sb
    .from("repair_entries")
    .select("part_group, service_id")
    .is("deleted_at", null)
    .in("part_group", partGroups)
    .returns<{ part_group: string | null; service_id: string }[]>();

  const serviceIds = [...new Set((entryRows ?? []).map((e) => e.service_id))];
  const { data: serviceRows } =
    serviceIds.length > 0
      ? await sb
          .from("repair_services")
          .select("id, service_date, odometer")
          .in("id", serviceIds)
          .returns<ServiceLite[]>()
      : { data: [] as ServiceLite[] };
  const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));

  const groupMaxOdo = new Map<string, number>();
  const groupMaxDate = new Map<string, string>();
  for (const e of entryRows ?? []) {
    const key = groupKey(e.part_group);
    if (!key) continue;
    const svc = serviceById.get(e.service_id);
    if (svc?.odometer != null) {
      groupMaxOdo.set(key, Math.max(groupMaxOdo.get(key) ?? 0, svc.odometer));
    }
    if (svc?.service_date && (groupMaxDate.get(key) ?? "") < svc.service_date) {
      groupMaxDate.set(key, svc.service_date);
    }
  }

  return reminders
    .map((r): MaintenanceReminder => {
      const key = groupKey(r.part_group);
      const lastOdo = (key ? groupMaxOdo.get(key) : undefined) ?? r.anchor_odo ?? null;
      const lastDate = (key ? groupMaxDate.get(key) : undefined) ?? r.anchor_date ?? null;
      const m = computeMaintenance(r.interval_miles, lastOdo, currentOdo);
      return {
        id: r.id,
        label: r.label,
        partGroup: r.part_group,
        category: cat(r.category),
        intervalMiles: r.interval_miles,
        status: m.status,
        milesRemaining: m.milesRemaining,
        nextDue: m.nextDue,
        lastOdo,
        lastDate,
        neverServiced: m.neverServiced,
        pct: m.pct,
      };
    })
    .sort((a, b) => {
      const d = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (d !== 0) return d;
      return (a.milesRemaining ?? Number.POSITIVE_INFINITY) - (b.milesRemaining ?? Number.POSITIVE_INFINITY);
    });
}

type RecentEntryRow = {
  id: string;
  description: string;
  position: string | null;
  part_group: string | null;
  category: string;
  service_id: string;
};

async function fetchRecentEntries(sb: SB, currentOdo: number, todayStr: string): Promise<RecentRepairEntry[]> {
  const { data: entryRows } = await sb
    .from("repair_entries")
    .select("id, description, position, part_group, category, service_id, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_ENTRIES_LIMIT)
    .returns<(RecentEntryRow & { created_at: string })[]>();
  const entries = entryRows ?? [];
  if (entries.length === 0) return [];

  const serviceIds = [...new Set(entries.map((e) => e.service_id))];
  const [{ data: serviceRows }, { data: attRows }] = await Promise.all([
    sb.from("repair_services").select("id, service_date, odometer").in("id", serviceIds).returns<ServiceLite[]>(),
    sb
      .from("repair_attachments")
      .select("service_id")
      .in("service_id", serviceIds)
      .returns<{ service_id: string }[]>(),
  ]);
  const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));
  const receiptCountByService = new Map<string, number>();
  for (const a of attRows ?? []) {
    receiptCountByService.set(a.service_id, (receiptCountByService.get(a.service_id) ?? 0) + 1);
  }

  return entries.map((e) => {
    const svc = serviceById.get(e.service_id);
    const date = svc?.service_date ?? null;
    const odometer = svc?.odometer ?? null;
    return {
      id: e.id,
      description: e.description,
      category: cat(e.category),
      position: e.position,
      partGroup: e.part_group,
      date,
      odometer,
      freshness: computeFreshness(odometer, currentOdo, date, todayStr),
      receiptCount: receiptCountByService.get(e.service_id) ?? 0,
    };
  });
}

type DismissedReminderRow = {
  id: string;
  label: string;
  part_group: string;
  category: string;
  interval_miles: number;
  dismissed_at: string;
};

async function fetchDismissedReminders(sb: SB): Promise<DismissedReminder[]> {
  const { data } = await sb
    .from("repair_reminders")
    .select("id, label, part_group, category, interval_miles, dismissed_at")
    .not("dismissed_at", "is", null)
    .order("dismissed_at", { ascending: false })
    .returns<DismissedReminderRow[]>();
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    partGroup: r.part_group,
    category: cat(r.category),
    intervalMiles: r.interval_miles,
    dismissedAt: r.dismissed_at,
  }));
}

export async function getMaintenanceOverview(): Promise<MaintenanceOverview> {
  const sb = createServiceRoleClient();
  const todayStr = centralDateKey();
  const currentOdo = await fetchCurrentOdo(sb);
  const [reminders, recentEntries, dismissedReminders] = await Promise.all([
    fetchReminders(sb, currentOdo),
    fetchRecentEntries(sb, currentOdo, todayStr),
    fetchDismissedReminders(sb),
  ]);
  return { currentOdo, reminders, recentEntries, dismissedReminders };
}

// ---------------------------------------------------------------------------
// Service types (Brent's per-service redesign, 2026-08-08): every service
// is tracked by its TYPE, each with its own history and its own logging —
// no more one combined mass log. A "type" is just `part_group` (already the
// join key between a `repair_reminders` interval and the `repair_entries`
// logged against it, see fetchReminders() above) — no schema change. This
// section builds the merged type catalog (real reminders + real entries +
// lib/dispatch/service-types.ts's curated baseline list) that both the
// Maintenance home (cards) and a type's own profile page read from.

type GroupStats = {
  /** First-seen original-cased part_group text — the exact value already
   * in use in the DB, reused verbatim so new writes against this type
   * (the per-type "+ Log this service" preset) keep matching it. */
  originalLabel: string;
  category: Category;
  lastOdo: number | null;
  lastDate: string | null;
};

/** Last-serviced odo/date per part_group, from every real, non-deleted
 * repair_entries row that has one — the same max-across-entries rule
 * fetchReminders() above already uses, just computed for every part_group
 * in the log (not only ones a reminder already references), since an
 * ad hoc type (no reminder yet) still needs its own "last done" line. */
async function computeGroupStats(sb: SB): Promise<Map<string, GroupStats>> {
  const { data: entryRows } = await sb
    .from("repair_entries")
    .select("part_group, category, service_id")
    .is("deleted_at", null)
    .not("part_group", "is", null)
    .returns<{ part_group: string | null; category: string; service_id: string }[]>();
  const entries = (entryRows ?? []).filter((e): e is { part_group: string; category: string; service_id: string } => !!e.part_group);
  const stats = new Map<string, GroupStats>();
  if (entries.length === 0) return stats;

  const serviceIds = [...new Set(entries.map((e) => e.service_id))];
  const { data: serviceRows } = await sb.from("repair_services").select("id, service_date, odometer").in("id", serviceIds).returns<ServiceLite[]>();
  const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));

  for (const e of entries) {
    const key = groupKey(e.part_group);
    if (!key) continue;
    const svc = serviceById.get(e.service_id);
    const existing = stats.get(key) ?? { originalLabel: e.part_group, category: cat(e.category), lastOdo: null, lastDate: null };
    if (svc?.odometer != null) existing.lastOdo = existing.lastOdo == null ? svc.odometer : Math.max(existing.lastOdo, svc.odometer);
    if (svc?.service_date && (existing.lastDate == null || existing.lastDate < svc.service_date)) existing.lastDate = svc.service_date;
    stats.set(key, existing);
  }
  return stats;
}

type ResolvedServiceType = {
  /** groupKey() of the real or canonical label — the one identity every
   * source (reminder/entries/canonical) merges on. */
  key: string;
  slug: string;
  label: string;
  category: Category;
  intervalMiles: number | null;
  lastOdo: number | null;
  lastDate: string | null;
};

/** Real reminders + real entry history + the curated baseline list,
 * deduplicated by groupKey (real data always wins over a canonical
 * placeholder — see service-types.ts's header for why). */
function mergeServiceTypes(reminderRows: ReminderRow[], groupStats: Map<string, GroupStats>): ResolvedServiceType[] {
  const byKey = new Map<string, ResolvedServiceType>();

  for (const r of reminderRows) {
    const key = groupKey(r.part_group);
    if (!key) continue;
    const stats = groupStats.get(key);
    byKey.set(key, {
      key,
      slug: slugify(r.part_group),
      label: r.label || r.part_group,
      category: cat(r.category),
      intervalMiles: r.interval_miles,
      lastOdo: stats?.lastOdo ?? r.anchor_odo ?? null,
      lastDate: stats?.lastDate ?? r.anchor_date ?? null,
    });
  }

  for (const [key, stats] of groupStats) {
    if (byKey.has(key)) continue;
    byKey.set(key, {
      key,
      slug: slugify(stats.originalLabel),
      label: stats.originalLabel,
      category: stats.category,
      intervalMiles: null,
      lastOdo: stats.lastOdo,
      lastDate: stats.lastDate,
    });
  }

  for (const c of CANONICAL_SERVICE_TYPES) {
    const candidateKeys = [c.label, ...c.aliases].map(groupKey).filter((k): k is string => !!k);
    if (candidateKeys.some((k) => byKey.has(k))) continue;
    const key = groupKey(c.label) as string;
    byKey.set(key, { key, slug: c.slug, label: c.label, category: c.category, intervalMiles: null, lastOdo: null, lastDate: null });
  }

  return [...byKey.values()];
}

export type ServiceTypeCard = {
  slug: string;
  label: string;
  category: Category;
  /** Null = no active reminder for this type yet — the card shows an
   * informational "no interval set" state instead of a status pill. */
  intervalMiles: number | null;
  lastOdo: number | null;
  lastDate: string | null;
  status: MaintStatus | null;
  milesRemaining: number | null;
  pct: number;
};

function toServiceTypeCard(t: ResolvedServiceType, currentOdo: number): ServiceTypeCard {
  if (t.intervalMiles == null) {
    return { slug: t.slug, label: t.label, category: t.category, intervalMiles: null, lastOdo: t.lastOdo, lastDate: t.lastDate, status: null, milesRemaining: null, pct: 0 };
  }
  const m = computeMaintenance(t.intervalMiles, t.lastOdo, currentOdo);
  return { slug: t.slug, label: t.label, category: t.category, intervalMiles: t.intervalMiles, lastOdo: t.lastOdo, lastDate: t.lastDate, status: m.status, milesRemaining: m.milesRemaining, pct: m.pct };
}

const CARD_RANK: Record<string, number> = { overdue: 0, soon: 1, baseline: 2, ok: 3 };

/** Worst-status first (matches the existing reminder-grid convention,
 * STATUS_RANK above); untracked types (no interval at all) sort last,
 * alphabetically among themselves. */
function cardSort(a: ServiceTypeCard, b: ServiceTypeCard): number {
  const rankA = a.status ? CARD_RANK[a.status] : 4;
  const rankB = b.status ? CARD_RANK[b.status] : 4;
  if (rankA !== rankB) return rankA - rankB;
  if (a.status == null) return a.label.localeCompare(b.label);
  return (a.milesRemaining ?? Number.POSITIVE_INFINITY) - (b.milesRemaining ?? Number.POSITIVE_INFINITY);
}

export async function getServiceTypesOverview(): Promise<{ currentOdo: number; types: ServiceTypeCard[] }> {
  const sb = createServiceRoleClient();
  const currentOdo = await fetchCurrentOdo(sb);
  const [{ data: reminderRows }, groupStats] = await Promise.all([
    sb
      .from("repair_reminders")
      .select("id, label, part_group, category, interval_miles, anchor_odo, anchor_date")
      .is("dismissed_at", null)
      .returns<ReminderRow[]>(),
    computeGroupStats(sb),
  ]);
  const types = mergeServiceTypes(reminderRows ?? [], groupStats)
    .map((t) => toServiceTypeCard(t, currentOdo))
    .sort(cardSort);
  return { currentOdo, types };
}

export type ServiceTypeHistoryItem = {
  serviceId: string;
  date: string | null;
  odometer: number | null;
  /** Joined descriptions of every part logged against this type in that
   * visit (usually one). */
  partsSummary: string;
  shop: string | null;
  receiptCount: number;
  cost: number | null;
};

export type ServiceTypeDetail = {
  slug: string;
  label: string;
  category: Category;
  intervalMiles: number | null;
  lastOdo: number | null;
  lastDate: string | null;
  status: MaintStatus | null;
  nextDue: number | null;
  milesRemaining: number | null;
  currentOdo: number;
  /** The real part_group text to write when logging against this type —
   * the canonical label when nothing's been logged for it yet. */
  partGroup: string;
  history: ServiceTypeHistoryItem[];
};

export async function getServiceTypeDetail(slug: string): Promise<ServiceTypeDetail | null> {
  const sb = createServiceRoleClient();
  const currentOdo = await fetchCurrentOdo(sb);
  const [{ data: reminderRows }, groupStats] = await Promise.all([
    sb
      .from("repair_reminders")
      .select("id, label, part_group, category, interval_miles, anchor_odo, anchor_date")
      .is("dismissed_at", null)
      .returns<ReminderRow[]>(),
    computeGroupStats(sb),
  ]);
  const type = mergeServiceTypes(reminderRows ?? [], groupStats).find((t) => t.slug === slug);
  if (!type) return null;

  const partGroupText = groupStats.get(type.key)?.originalLabel ?? type.label;
  const m = type.intervalMiles != null ? computeMaintenance(type.intervalMiles, type.lastOdo, currentOdo) : null;

  const { data: entryRows } = await sb
    .from("repair_entries")
    .select("id, description, service_id")
    .is("deleted_at", null)
    .ilike("part_group", partGroupText)
    .returns<{ id: string; description: string; service_id: string }[]>();
  const entries = entryRows ?? [];

  let history: ServiceTypeHistoryItem[] = [];
  if (entries.length > 0) {
    const serviceIds = [...new Set(entries.map((e) => e.service_id))];
    const [{ data: serviceRows }, { data: attRows }] = await Promise.all([
      sb
        .from("repair_services")
        .select("id, service_date, odometer, shop, total_cost")
        .in("id", serviceIds)
        .returns<{ id: string; service_date: string | null; odometer: number | null; shop: string | null; total_cost: number | string | null }[]>(),
      sb.from("repair_attachments").select("service_id").in("service_id", serviceIds).returns<{ service_id: string }[]>(),
    ]);
    const serviceById = new Map((serviceRows ?? []).map((s) => [s.id, s]));
    const receiptCountByService = new Map<string, number>();
    for (const a of attRows ?? []) receiptCountByService.set(a.service_id, (receiptCountByService.get(a.service_id) ?? 0) + 1);

    const bySvc = new Map<string, string[]>();
    for (const e of entries) {
      const arr = bySvc.get(e.service_id) ?? [];
      arr.push(e.description);
      bySvc.set(e.service_id, arr);
    }
    history = [...bySvc.entries()]
      .map(([serviceId, descriptions]) => {
        const svc = serviceById.get(serviceId);
        return {
          serviceId,
          date: svc?.service_date ?? null,
          odometer: svc?.odometer ?? null,
          partsSummary: descriptions.join(", "),
          shop: svc?.shop ?? null,
          receiptCount: receiptCountByService.get(serviceId) ?? 0,
          cost: num(svc?.total_cost),
        };
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  return {
    slug: type.slug,
    label: type.label,
    category: type.category,
    intervalMiles: type.intervalMiles,
    lastOdo: type.lastOdo,
    lastDate: type.lastDate,
    status: m?.status ?? null,
    nextDue: m?.nextDue ?? null,
    milesRemaining: m?.milesRemaining ?? null,
    currentOdo,
    partGroup: partGroupText,
    history,
  };
}

export type MaintenanceServiceFull = {
  id: string;
  date: string | null;
  odometer: number | null;
  totalCost: number | null;
  notes: string | null;
  receipts: ReceiptView[];
  parts: { id: string; description: string; category: Category; subCategory: string | null; partGroup: string | null; reminderInterval: number | null }[];
};

/** One whole service (visit), for the "tap a history row to edit" flow —
 * unlike getRepairEntryDetail() (anchored to one PART), this is anchored to
 * the SERVICE itself, so a type-profile's history row can open the same
 * edit modal regardless of which of the visit's parts matched this type. */
export async function getServiceFull(serviceId: string): Promise<MaintenanceServiceFull | null> {
  if (!serviceId) return null;
  const sb = createServiceRoleClient();

  const { data: svc } = await sb
    .from("repair_services")
    .select("id, service_date, odometer, total_cost, notes")
    .eq("id", serviceId)
    .maybeSingle<{ id: string; service_date: string | null; odometer: number | null; total_cost: number | string | null; notes: string | null }>();
  if (!svc) return null;

  const firstPartsAttempt = await sb
    .from("repair_entries")
    .select(ENTRY_COLUMNS_FULL)
    .eq("service_id", serviceId)
    .is("deleted_at", null)
    .returns<EntryRow[]>();
  const partsError = firstPartsAttempt.error;
  let partRows = firstPartsAttempt.data;
  if (partsError && isMissingColumnError(partsError, "sub_category")) {
    ({ data: partRows } = await sb.from("repair_entries").select(ENTRY_COLUMNS_BASE).eq("service_id", serviceId).is("deleted_at", null).returns<EntryRow[]>());
  }
  const parts = partRows ?? [];

  const partGroups = [...new Set(parts.map((p) => p.part_group).filter((g): g is string => !!g))];
  const { data: reminderRows } =
    partGroups.length > 0
      ? await sb
          .from("repair_reminders")
          .select("part_group, interval_miles")
          .is("dismissed_at", null)
          .in("part_group", partGroups)
          .returns<{ part_group: string; interval_miles: number }[]>()
      : { data: [] as { part_group: string; interval_miles: number }[] };
  const intervalByKey = new Map((reminderRows ?? []).map((r) => [groupKey(r.part_group) as string, r.interval_miles]));

  const receipts = await fetchReceipts(sb, serviceId);

  return {
    id: svc.id,
    date: svc.service_date,
    odometer: svc.odometer,
    totalCost: num(svc.total_cost),
    notes: svc.notes,
    receipts,
    parts: parts.map((p) => ({
      id: p.id,
      description: p.description,
      category: cat(p.category),
      subCategory: p.sub_category ?? null,
      partGroup: p.part_group,
      reminderInterval: p.part_group ? (intervalByKey.get(groupKey(p.part_group) as string) ?? null) : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Repair entry detail — one part, its service (visit), the other parts
// replaced in that same visit, its receipts (signed), and its related-part
// links. Every query below is scoped to the one focused entry/service/link
// set — never a full-table read.

export type ReceiptView = { id: string; name: string; url: string | null; isImage: boolean };

export type RepairEntryDetail = {
  id: string;
  description: string;
  category: Category;
  position: string | null;
  subCategory: string | null;
  partGroup: string | null;
  reminderIntervalMiles: number | null;
  freshness: Freshness | null;
  currentOdo: number;
  service: {
    id: string;
    date: string | null;
    odometer: number | null;
    shop: string | null;
    totalCost: number | null;
    notes: string | null;
    receipts: ReceiptView[];
  };
  otherParts: { id: string; description: string; category: Category; position: string | null; subCategory: string | null; partGroup: string | null }[];
  relatedParts: {
    id: string;
    description: string;
    date: string | null;
    odometer: number | null;
    freshness: Freshness;
  }[];
};

type EntryRow = {
  id: string;
  description: string;
  position: string | null;
  // Optional, not `| null` — see ENTRY_COLUMNS_BASE/-FULL below: the
  // fallback query genuinely omits this key rather than returning it null.
  sub_category?: string | null;
  part_group: string | null;
  category: string;
  service_id: string;
};

/** True for a Postgrest "unknown column" error naming `column` — either a
 * raw Postgres 42703 (undefined_column) or Postgrest's own PGRST204 schema-
 * cache miss, depending on how the request was rejected. Mirrors admin/
 * (authed)/maintenance/actions.ts's identical write-side guard. */
function isMissingColumnError(error: { code?: string | null; message?: string | null } | null, column: string): boolean {
  if (!error) return false;
  return (error.code === "42703" || error.code === "PGRST204") && (error.message ?? "").includes(column);
}

// sub_category (supabase/migrations/20260808000000_repair_entries_sub_
// category.sql) can only be applied by hand — until it's confirmed live,
// selecting it 400s the whole query. Both entry-detail selects below try
// the full column list first and fall back to the base list on that
// specific failure, so this page keeps working (minus that one field)
// during the rollout window instead of showing "not found" for every
// entry — same pattern lib/data/recurring-expenses.ts's EXPENSE_COLUMNS_
// FULL/BASE already established.
const ENTRY_COLUMNS_BASE = "id, description, position, part_group, category, service_id";
const ENTRY_COLUMNS_FULL = `${ENTRY_COLUMNS_BASE}, sub_category`;
const SIBLING_COLUMNS_BASE = "id, description, category, position, part_group";
const SIBLING_COLUMNS_FULL = `${SIBLING_COLUMNS_BASE}, sub_category`;

type ServiceRow = {
  id: string;
  service_date: string | null;
  odometer: number | null;
  shop: string | null;
  total_cost: number | string | null;
  notes: string | null;
};

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchReceipts(sb: SB, serviceId: string): Promise<ReceiptView[]> {
  const { data: attRows } = await sb
    .from("repair_attachments")
    .select("id, file_path, file_name, content_type")
    .eq("service_id", serviceId)
    .returns<{ id: string; file_path: string; file_name: string | null; content_type: string | null }[]>();
  const atts = attRows ?? [];
  if (atts.length === 0) return [];

  const { data: signedList } = await sb.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrls(atts.map((a) => a.file_path), 3600);
  const signedByPath = new Map<string, string>();
  for (const s of signedList ?? []) {
    if (s.path && s.signedUrl && !s.error) signedByPath.set(s.path, s.signedUrl);
  }
  return atts.map((a) => ({
    id: a.id,
    name: a.file_name ?? "receipt",
    url: signedByPath.get(a.file_path) ?? null,
    isImage: (a.content_type ?? "").startsWith("image/"),
  }));
}

export async function getRepairEntryDetail(id: string): Promise<RepairEntryDetail | null> {
  if (!id) return null;

  const sb = createServiceRoleClient();

  const firstFocusedAttempt = await sb
    .from("repair_entries")
    .select(ENTRY_COLUMNS_FULL)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<EntryRow>();
  const focusedError = firstFocusedAttempt.error;
  let focused = firstFocusedAttempt.data;
  if (focusedError && isMissingColumnError(focusedError, "sub_category")) {
    ({ data: focused } = await sb
      .from("repair_entries")
      .select(ENTRY_COLUMNS_BASE)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<EntryRow>());
  }
  if (!focused) return null;

  const siblingsQuery = sb
    .from("repair_entries")
    .select(SIBLING_COLUMNS_FULL)
    .eq("service_id", focused.service_id)
    .neq("id", id)
    .is("deleted_at", null)
    .returns<{ id: string; description: string; category: string; position: string | null; sub_category?: string | null; part_group: string | null }[]>();

  const [{ data: svc }, { data: siblingRows, error: siblingError }, { data: linkRows }, currentOdo, receipts] = await Promise.all([
    sb
      .from("repair_services")
      .select("id, service_date, odometer, shop, total_cost, notes")
      .eq("id", focused.service_id)
      .maybeSingle<ServiceRow>(),
    siblingsQuery,
    sb
      .from("repair_links")
      .select("a_id, b_id")
      .or(`a_id.eq.${id},b_id.eq.${id}`)
      .returns<{ a_id: string; b_id: string }[]>(),
    fetchCurrentOdo(sb),
    fetchReceipts(sb, focused.service_id),
  ]);

  let siblings = siblingRows;
  if (siblingError && isMissingColumnError(siblingError, "sub_category")) {
    const retry = await sb
      .from("repair_entries")
      .select(SIBLING_COLUMNS_BASE)
      .eq("service_id", focused.service_id)
      .neq("id", id)
      .is("deleted_at", null)
      .returns<{ id: string; description: string; category: string; position: string | null; sub_category?: string | null; part_group: string | null }[]>();
    siblings = retry.data;
  }

  const svcDate = svc?.service_date ?? null;
  const svcOdo = svc?.odometer ?? null;
  const todayStr = centralDateKey();

  let reminderIntervalMiles: number | null = null;
  if (focused.part_group) {
    const { data: rem } = await sb
      .from("repair_reminders")
      .select("interval_miles")
      .ilike("part_group", focused.part_group)
      .is("dismissed_at", null)
      .limit(1)
      .maybeSingle<{ interval_miles: number }>();
    reminderIntervalMiles = rem?.interval_miles ?? null;
  }

  const relatedIds = (linkRows ?? []).map((l) => (l.a_id === id ? l.b_id : l.a_id));
  let relatedParts: RepairEntryDetail["relatedParts"] = [];
  if (relatedIds.length > 0) {
    const { data: relatedEntryRows } = await sb
      .from("repair_entries")
      .select("id, description, service_id")
      .in("id", relatedIds)
      .is("deleted_at", null)
      .returns<{ id: string; description: string; service_id: string }[]>();
    const relEntries = relatedEntryRows ?? [];
    const relServiceIds = [...new Set(relEntries.map((r) => r.service_id))];
    const { data: relServiceRows } =
      relServiceIds.length > 0
        ? await sb
            .from("repair_services")
            .select("id, service_date, odometer")
            .in("id", relServiceIds)
            .returns<ServiceLite[]>()
        : { data: [] as ServiceLite[] };
    const relServiceById = new Map((relServiceRows ?? []).map((s) => [s.id, s]));
    relatedParts = relEntries
      .map((r) => {
        const rs = relServiceById.get(r.service_id);
        const d = rs?.service_date ?? null;
        const o = rs?.odometer ?? null;
        return {
          id: r.id,
          description: r.description,
          date: d,
          odometer: o,
          freshness: computeFreshness(o, currentOdo, d, todayStr),
        };
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }

  return {
    id: focused.id,
    description: focused.description,
    category: cat(focused.category),
    position: focused.position,
    subCategory: focused.sub_category ?? null,
    partGroup: focused.part_group,
    reminderIntervalMiles,
    freshness: computeFreshness(svcOdo, currentOdo, svcDate, todayStr),
    currentOdo,
    service: {
      id: focused.service_id,
      date: svcDate,
      odometer: svcOdo,
      shop: svc?.shop ?? null,
      totalCost: num(svc?.total_cost),
      notes: svc?.notes ?? null,
      receipts,
    },
    otherParts: (siblings ?? []).map((p) => ({
      id: p.id,
      description: p.description,
      category: cat(p.category),
      position: p.position,
      subCategory: p.sub_category ?? null,
      partGroup: p.part_group,
    })),
    relatedParts,
  };
}
