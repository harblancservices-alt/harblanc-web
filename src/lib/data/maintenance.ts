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
import { isDemoMode } from "@/lib/admin/demo";
import { centralDateKey } from "@/lib/domain/dates";
import {
  computeFreshness,
  groupKey,
  isCategory,
  type Category,
  type Freshness,
} from "@/lib/dispatch/repair-log";
import { computeMaintenance, type MaintStatus } from "@/lib/dispatch/maintenance";

export type { Category, Freshness, MaintStatus };

type SB = ReturnType<typeof createServiceRoleClient>;

const RECEIPT_BUCKET = "maintenance-receipts";
const RECENT_ENTRIES_LIMIT = 20;

function cat(v: string | null | undefined): Category {
  return isCategory(v) ? v : "Other";
}

// ---------------------------------------------------------------------------
// Current odometer — highest reading across all non-deleted loads' three
// odometer columns, via one bounded order+limit(1) query per column instead
// of pulling every load row to compute a client-side max.

async function fetchCurrentOdo(sb: SB): Promise<number> {
  const columns = ["odo_assigned", "odo_loaded", "odo_delivered"] as const;
  const maxes = await Promise.all(
    columns.map(async (col) => {
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
  );
  return Math.max(0, ...maxes);
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

export type MaintenanceOverview = {
  currentOdo: number;
  /** Every active (non-dismissed) reminder, worst-status first. */
  reminders: MaintenanceReminder[];
  /** Most recently logged parts, newest first. */
  recentEntries: RecentRepairEntry[];
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

export async function getMaintenanceOverview(): Promise<MaintenanceOverview> {
  if (await isDemoMode()) return demoOverview();

  const sb = createServiceRoleClient();
  const todayStr = centralDateKey();
  const currentOdo = await fetchCurrentOdo(sb);
  const [reminders, recentEntries] = await Promise.all([
    fetchReminders(sb, currentOdo),
    fetchRecentEntries(sb, currentOdo, todayStr),
  ]);
  return { currentOdo, reminders, recentEntries };
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
  otherParts: { id: string; description: string; category: Category; position: string | null; partGroup: string | null }[];
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
  if (await isDemoMode()) return demoEntryDetail(id);
  if (!id) return null;

  const sb = createServiceRoleClient();

  const { data: focused } = await sb
    .from("repair_entries")
    .select("id, description, position, part_group, category, service_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<EntryRow>();
  if (!focused) return null;

  const [{ data: svc }, { data: siblingRows }, { data: linkRows }, currentOdo, receipts] = await Promise.all([
    sb
      .from("repair_services")
      .select("id, service_date, odometer, shop, total_cost, notes")
      .eq("id", focused.service_id)
      .maybeSingle<ServiceRow>(),
    sb
      .from("repair_entries")
      .select("id, description, category, position, part_group")
      .eq("service_id", focused.service_id)
      .neq("id", id)
      .is("deleted_at", null)
      .returns<{ id: string; description: string; category: string; position: string | null; part_group: string | null }[]>(),
    sb
      .from("repair_links")
      .select("a_id, b_id")
      .or(`a_id.eq.${id},b_id.eq.${id}`)
      .returns<{ a_id: string; b_id: string }[]>(),
    fetchCurrentOdo(sb),
    fetchReceipts(sb, focused.service_id),
  ]);

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
    otherParts: (siblingRows ?? []).map((p) => ({
      id: p.id,
      description: p.description,
      category: cat(p.category),
      position: p.position,
      partGroup: p.part_group,
    })),
    relatedParts,
  };
}

// ---------------------------------------------------------------------------
// DEMO — a small, self-contained curated set (unrelated to the shared
// loads/trips/brokers demo dataset in demo-dataset.ts, so it stays local
// rather than growing that shared file mid-phase — same call
// `recurring-expenses.ts` already made). Generated relative to "now" so it
// stays evergreen; covers all four reminder statuses (overdue/soon/ok/
// baseline) and demonstrates same-visit auto-linked related parts.

type DemoFixture = {
  id: string;
  description: string;
  category: Category;
  partGroup: string | null;
  serviceId: string;
  daysAgo: number;
  milesAgo: number;
  shop: string | null;
  serviceTotalCost: number | null;
  notes: string | null;
  hasReceipt: boolean;
  receiptIsImage: boolean;
  reminderIntervalMiles: number | null;
};

function demoNow(): Date {
  return new Date();
}

/** ~45mi/day average since a fixed anchor — evergreen, no real DB read. */
function demoCurrentOdo(now: Date): number {
  const anchor = Date.UTC(2026, 0, 1);
  const days = Math.max(0, Math.floor((now.getTime() - anchor) / 86_400_000));
  return 78_000 + days * 45;
}

function demoFixtures(): DemoFixture[] {
  return [
    {
      id: "demo-repair-oil-filter",
      description: "Engine oil & filter",
      category: "Engine Bay",
      partGroup: "Engine oil & filter",
      serviceId: "demo-svc-oil",
      daysAgo: 95,
      milesAgo: 9_200,
      shop: "Quick Lube Express",
      serviceTotalCost: 210,
      notes: "Full synthetic 15w-40, both filters replaced.",
      hasReceipt: true,
      receiptIsImage: true,
      reminderIntervalMiles: 10_000,
    },
    {
      id: "demo-repair-fuel-filter",
      description: "Fuel filters (primary + secondary)",
      category: "Engine Bay",
      partGroup: "Fuel filters",
      serviceId: "demo-svc-oil",
      daysAgo: 95,
      milesAgo: 9_200,
      shop: "Quick Lube Express",
      serviceTotalCost: 210,
      notes: "Full synthetic 15w-40, both filters replaced.",
      hasReceipt: true,
      receiptIsImage: true,
      reminderIntervalMiles: 15_000,
    },
    {
      id: "demo-repair-brake-pads",
      description: "Front brake pads + rotors",
      category: "Brakes",
      partGroup: "Front brake pads",
      serviceId: "demo-svc-brakes",
      daysAgo: 260,
      milesAgo: 24_000,
      shop: "Rush Truck Centers",
      serviceTotalCost: 380,
      notes: "Pads replaced, rotors resurfaced.",
      hasReceipt: true,
      receiptIsImage: false,
      reminderIntervalMiles: 20_000,
    },
    {
      id: "demo-repair-grease",
      description: "Grease all chassis fittings",
      category: "Steering & Suspension",
      partGroup: "Chassis grease",
      serviceId: "demo-svc-grease",
      daysAgo: 40,
      milesAgo: 3_600,
      shop: null,
      serviceTotalCost: null,
      notes: "Chassis lube at fuel stop.",
      hasReceipt: false,
      receiptIsImage: false,
      reminderIntervalMiles: 5_000,
    },
    {
      id: "demo-repair-ujoint",
      description: "U-joint replacement",
      category: "Drivetrain",
      partGroup: null,
      serviceId: "demo-svc-drivetrain",
      daysAgo: 600,
      milesAgo: 58_000,
      shop: "Rush Truck Centers",
      serviceTotalCost: 240,
      notes: null,
      hasReceipt: false,
      receiptIsImage: false,
      reminderIntervalMiles: null,
    },
    {
      id: "demo-repair-carrier-bearing",
      description: "Driveshaft carrier bearing",
      category: "Drivetrain",
      partGroup: null,
      serviceId: "demo-svc-drivetrain",
      daysAgo: 600,
      milesAgo: 58_000,
      shop: "Rush Truck Centers",
      serviceTotalCost: 240,
      notes: null,
      hasReceipt: false,
      receiptIsImage: false,
      reminderIntervalMiles: null,
    },
  ];
}

/** DEF filter — an active reminder with nothing ever logged against it, the
 * "no baseline" (never serviced) case. */
const DEMO_BASELINE_REMINDER = {
  id: "demo-reminder-def-filter",
  label: "DEF filter",
  partGroup: "DEF filter",
  category: "Engine Bay" as Category,
  intervalMiles: 30_000,
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function demoOverview(): MaintenanceOverview {
  const now = demoNow();
  const currentOdo = demoCurrentOdo(now);
  const todayStr = centralDateKey(now);
  const fixtures = demoFixtures();

  const reminderFixtures = fixtures.filter((f) => f.reminderIntervalMiles != null && f.partGroup);
  const byPartGroup = new Map<string, DemoFixture>();
  for (const f of reminderFixtures) {
    const key = groupKey(f.partGroup);
    if (!key) continue;
    // Latest (smallest milesAgo) fixture per part group.
    const existing = byPartGroup.get(key);
    if (!existing || f.milesAgo < existing.milesAgo) byPartGroup.set(key, f);
  }

  const reminders: MaintenanceReminder[] = [...byPartGroup.values()]
    .map((f): MaintenanceReminder => {
      const lastOdo = currentOdo - f.milesAgo;
      const m = computeMaintenance(f.reminderIntervalMiles as number, lastOdo, currentOdo);
      return {
        id: `demo-reminder-${groupKey(f.partGroup)}`,
        label: f.description,
        partGroup: f.partGroup as string,
        category: f.category,
        intervalMiles: f.reminderIntervalMiles as number,
        status: m.status,
        milesRemaining: m.milesRemaining,
        nextDue: m.nextDue,
        lastOdo,
        lastDate: toIsoDate(new Date(now.getTime() - f.daysAgo * 86_400_000)),
        neverServiced: false,
        pct: m.pct,
      };
    })
    .concat([
      (() => {
        const m = computeMaintenance(DEMO_BASELINE_REMINDER.intervalMiles, null, currentOdo);
        return {
          id: DEMO_BASELINE_REMINDER.id,
          label: DEMO_BASELINE_REMINDER.label,
          partGroup: DEMO_BASELINE_REMINDER.partGroup,
          category: DEMO_BASELINE_REMINDER.category,
          intervalMiles: DEMO_BASELINE_REMINDER.intervalMiles,
          status: m.status,
          milesRemaining: m.milesRemaining,
          nextDue: m.nextDue,
          lastOdo: null,
          lastDate: null,
          neverServiced: true,
          pct: m.pct,
        };
      })(),
    ])
    .sort((a, b) => {
      const d = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (d !== 0) return d;
      return (a.milesRemaining ?? Number.POSITIVE_INFINITY) - (b.milesRemaining ?? Number.POSITIVE_INFINITY);
    });

  const receiptCountByService = new Map<string, number>();
  for (const f of fixtures) {
    if (f.hasReceipt) receiptCountByService.set(f.serviceId, (receiptCountByService.get(f.serviceId) ?? 0) + 1);
  }

  const recentEntries: RecentRepairEntry[] = fixtures
    .slice()
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .map((f) => {
      const odometer = currentOdo - f.milesAgo;
      const date = toIsoDate(new Date(now.getTime() - f.daysAgo * 86_400_000));
      return {
        id: f.id,
        description: f.description,
        category: f.category,
        position: null,
        partGroup: f.partGroup,
        date,
        odometer,
        freshness: computeFreshness(odometer, currentOdo, date, todayStr),
        receiptCount: receiptCountByService.get(f.serviceId) ?? 0,
      };
    });

  return { currentOdo, reminders, recentEntries };
}

function demoEntryDetail(id: string): RepairEntryDetail | null {
  const now = demoNow();
  const currentOdo = demoCurrentOdo(now);
  const todayStr = centralDateKey(now);
  const fixtures = demoFixtures();
  const focused = fixtures.find((f) => f.id === id);
  if (!focused) return null;

  const odometer = currentOdo - focused.milesAgo;
  const date = toIsoDate(new Date(now.getTime() - focused.daysAgo * 86_400_000));

  const siblings = fixtures.filter((f) => f.serviceId === focused.serviceId && f.id !== focused.id);
  const otherParts = siblings.map((f) => ({
    id: f.id,
    description: f.description,
    category: f.category,
    position: null,
    partGroup: f.partGroup,
  }));
  // Same-visit parts are auto-linked as related, matching the real
  // autoLinkServiceParts() business rule.
  const relatedParts = siblings.map((f) => ({
    id: f.id,
    description: f.description,
    date,
    odometer,
    freshness: computeFreshness(odometer, currentOdo, date, todayStr),
  }));

  const receipts: ReceiptView[] = focused.hasReceipt
    ? [
        {
          id: `${focused.id}-receipt`,
          name: focused.receiptIsImage ? "receipt.jpg" : "receipt.pdf",
          url: null,
          isImage: focused.receiptIsImage,
        },
      ]
    : [];

  return {
    id: focused.id,
    description: focused.description,
    category: focused.category,
    position: null,
    partGroup: focused.partGroup,
    reminderIntervalMiles: focused.reminderIntervalMiles,
    freshness: computeFreshness(odometer, currentOdo, date, todayStr),
    currentOdo,
    service: {
      id: focused.serviceId,
      date,
      odometer,
      shop: focused.shop,
      totalCost: focused.serviceTotalCost,
      notes: focused.notes,
      receipts,
    },
    otherParts,
    relatedParts,
  };
}
