import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchOpenTripNames } from "@/lib/dispatch/active-trips";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";
import {
  computeMaintenance,
  currentOdoFromLoads,
  groupKey,
} from "@/lib/dispatch/repair-log";
import {
  loadDiesel,
  loadNet,
  FUEL_DEFAULTS,
  type FuelSettings,
} from "@/lib/dispatch/fuel";
import type { CountdownGoal, NetPace } from "@/lib/dispatch/countdown";
import {
  daysOutstanding,
  incompleteGaps,
  GAP_LABEL,
  RECEIVABLE_OVERDUE_DAYS,
  type AlertGroup,
} from "@/lib/dispatch/alerts";
import { DashboardView, type DashboardData } from "./DashboardView";

// The two reminders surfaced on the dashboard's quick maintenance WIDGET
// (matched by their repair_reminders label, carried over from the old item
// names in the repair-log migration). Note this is now only the widget's
// filter — the alerts panel considers every active reminder, so an overdue
// item outside these two still surfaces at the top of the page.
const DASH_MAINT_NAMES = [
  "Engine oil & filter",
  "Fuel filters (engine + chassis)",
];

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Owner Dashboard — opportunity inbox.
 *
 * The quote pipeline funnel now lives at the top of the Quotes page
 * (QuotesPipeline + loadPipelineCards). The dashboard keeps active loads, the
 * truck-maintenance widget, and the "Expired quotes" table — the last of
 * which still derives from the shared pipeline cards — under a top alert bar
 * that flags new job applications and new quote requests.
 */

// "New / not yet handled" definitions for the top alert bar:
//   - Applications have no reviewed/handled field (schema is created_at +
//     deleted_at only), so "new" = active and received within the last 24h,
//     matching the <24h "indigo" convention already used on the apps table.
//   - Quote requests carry a lead_status that defaults to 'new' on intake and
//     advances ('contacted', 'estimate_sent', …) the moment Brent works them,
//     so "new" = active (not trashed) and still lead_status = 'new'.
const NEW_APPLICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

// Recent window the countdown breakdown averages over: the last ~12 weeks of
// delivered loads. Average net per load and the weekly net pace are both drawn
// from this window (weekly pace = total window net ÷ WINDOW_WEEKS).
const NET_PACE_WINDOW_WEEKS = 12;
const NET_PACE_WINDOW_MS = NET_PACE_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadDashboard(): Promise<DashboardData> {
  const sb = createServiceRoleClient();
  const now = new Date();
  const appCutoff = new Date(
    now.getTime() - NEW_APPLICATION_WINDOW_MS,
  ).toISOString();
  const netPaceCutoffMs = now.getTime() - NET_PACE_WINDOW_MS;

  const [
    pipelineCards,
    { count: newApplicationCount },
    { count: newQuoteCount },
    { data: loadRows },
    { data: brokerRows },
    activeTrips,
    { data: reminderRows },
    { data: odoRows },
    { data: goalRows },
    { data: deliveredRows },
    { data: fuelRow },
    { data: expRows },
    { data: factoringBrokers },
    { data: docRows },
  ] = await Promise.all([
    // Shared pipeline cards — the dashboard only renders the expired ones.
    loadPipelineCards(),
    // New job applications: active + received in the last 24h.
    sb
      .from("applications")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", appCutoff),
    // New quote requests: active + still at the default 'new' lead_status.
    sb
      .from("quote_requests")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("lead_status", "new"),
    sb
      .from("loads")
      .select(
        "id, broker_name, origin, destination, rate, status, odo_assigned, odo_loaded, odo_delivered",
      )
      .is("deleted_at", null)
      .in("status", ["pending", "assigned", "loaded"])
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<
        {
          id: string;
          broker_name: string | null;
          origin: string | null;
          destination: string | null;
          rate: number | string | null;
          status: string;
          odo_assigned: number | null;
          odo_loaded: number | null;
          odo_delivered: number | null;
        }[]
      >(),
    sb
      .from("brokers")
      .select("name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<{ name: string | null }[]>(),
    fetchOpenTripNames(sb),
    // ALL active reminders. The widget below narrows to DASH_MAINT_NAMES, but
    // the alerts panel needs every reminder so nothing overdue hides just
    // because it isn't oil or fuel filters.
    sb
      .from("repair_reminders")
      .select("id, label, part_group, interval_miles, anchor_odo")
      .is("dismissed_at", null)
      .returns<
        {
          id: string;
          label: string;
          part_group: string;
          interval_miles: number;
          anchor_odo: number | null;
        }[]
      >(),
    // Odometer readings across all non-deleted loads → current odometer.
    sb
      .from("loads")
      .select("odo_assigned, odo_loaded, odo_delivered")
      .is("deleted_at", null)
      .returns<
        {
          odo_assigned: number | null;
          odo_loaded: number | null;
          odo_delivered: number | null;
        }[]
      >(),
    // Countdown goals — the editable financial targets for the dashboard widget.
    sb
      .from("countdown_goals")
      .select("id, label, subtitle, target_amount, target_date, created_at")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<
        {
          id: string;
          label: string;
          subtitle: string | null;
          target_amount: number | string | null;
          target_date: string;
          created_at: string;
        }[]
      >(),
    // Delivered loads — ONE fetch serving three consumers: the net-pace
    // aggregates (windowed in JS below), the overdue-receivables alerts
    // (payment_status != 'paid' + aged past 40d), and the incomplete-load
    // alerts (missing paperwork or odometer). All three want the identical row
    // set — delivered and not soft-deleted — so splitting them into separate
    // queries would just be the same scan three times.
    sb
      .from("loads")
      .select(
        "id, load_number, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, broker_id, broker_name, origin, destination, payment_status, delivery_date, created_at",
      )
      .eq("status", "delivered")
      .is("deleted_at", null)
      .returns<
        {
          id: string;
          load_number: string | null;
          rate: number | string | null;
          loaded_miles: number | null;
          odo_assigned: number | null;
          odo_loaded: number | null;
          odo_delivered: number | null;
          broker_id: string | null;
          broker_name: string | null;
          origin: string | null;
          destination: string | null;
          payment_status: string | null;
          delivery_date: string | null;
          created_at: string;
        }[]
      >(),
    // Fuel/factoring inputs — the exact same loadNet inputs the Load Board and
    // Calendar use, so the per-load net here is the canonical one.
    sb
      .from("dispatch_settings")
      .select("mpg, diesel_price_per_gallon, factoring_pct, current_cash")
      .eq("id", true)
      .maybeSingle<{
        mpg: number | string;
        diesel_price_per_gallon: number | string;
        factoring_pct: number | string;
        current_cash: number | string | null;
      }>(),
    sb
      .from("load_expenses")
      .select("load_id, amount")
      .is("deleted_at", null)
      .returns<{ load_id: string; amount: number | string }[]>(),
    sb
      .from("brokers")
      .select("id")
      .eq("factoring", true)
      .is("deleted_at", null)
      .returns<{ id: string }[]>(),
    // Every load document, both consumers in one pass: the ACTIVE loads' per-
    // kind counts (the Rate Con / BOL / POD buttons) and the DELIVERED loads'
    // rate-con/BOL presence (the incomplete-load alerts). Fetching them here
    // rather than in a follow-up .in("load_id", …) keeps the whole dashboard
    // on a single round of parallel queries — this table holds a handful of
    // rows per load for a one-truck operation, so the id filter bought little.
    sb
      .from("load_documents")
      .select("load_id, kind")
      .in("kind", ["rate_con", "bol", "pod"])
      .returns<{ load_id: string; kind: "rate_con" | "bol" | "pod" }[]>(),
  ]);

  // Expired quotes drop off the forward pipeline into their own section.
  const expiredQuotes = pipelineCards.filter((c) => c.status === "expired");

  // Per-kind document counts, keyed by load. Feeds the ACTIVE loads' Rate Con
  // / BOL / POD buttons (how many files are attached) and the DELIVERED loads'
  // incomplete check (whether a rate con / BOL exists at all).
  const docCounts = new Map<string, { rate_con: number; bol: number; pod: number }>();
  for (const r of docRows ?? []) {
    const c = docCounts.get(r.load_id) ?? { rate_con: 0, bol: 0, pod: 0 };
    c[r.kind] += 1;
    docCounts.set(r.load_id, c);
  }

  // Active dispatch loads (not delivered/cancelled) for the at-a-glance card.
  const activeLoads = (loadRows ?? []).map((l) => {
    const rateN =
      l.rate == null
        ? 0
        : typeof l.rate === "number"
          ? l.rate
          : Number(l.rate) || 0;
    const c = docCounts.get(l.id) ?? { rate_con: 0, bol: 0, pod: 0 };
    return {
      id: l.id,
      broker: l.broker_name?.trim() || "No broker",
      lane: `${l.origin?.trim() || "—"} → ${l.destination?.trim() || "—"}`,
      status: l.status,
      rateDisplay: "$" + Math.round(rateN).toLocaleString("en-US"),
      rateConCount: c.rate_con,
      bolCount: c.bol,
      podCount: c.pod,
      odoAssigned: l.odo_assigned,
      odoLoaded: l.odo_loaded,
      odoDelivered: l.odo_delivered,
    };
  });

  // Add-load modal data (broker autocomplete + active-trip picker) — the
  // dashboard's "Active loads" empty state hosts the same Add Load flow as
  // the Load Board, so it needs the same option lists.
  const brokerNames = (brokerRows ?? [])
    .map((b) => b.name?.trim() ?? "")
    .filter((n) => n.length > 0);

  // Maintenance widget — oil + fuel-filter reminders against the truck's
  // current odometer (highest reading across non-deleted loads). Each
  // reminder's last-done odometer is the highest reading among the SERVICES of
  // the parts in its part_group, falling back to its anchor baseline.
  const maintOdo = currentOdoFromLoads(odoRows);
  const reminders = reminderRows ?? [];
  const maxOdoByGroup = new Map<string, number>();
  if (reminders.length > 0) {
    const { data: partRows } = await sb
      .from("repair_entries")
      .select("service_id, part_group")
      .is("deleted_at", null)
      .in(
        "part_group",
        reminders.map((r) => r.part_group),
      )
      .returns<{ service_id: string | null; part_group: string | null }[]>();
    const svcIds = Array.from(
      new Set((partRows ?? []).map((p) => p.service_id).filter((s): s is string => !!s)),
    );
    const odoByService = new Map<string, number>();
    if (svcIds.length > 0) {
      const { data: svcRows } = await sb
        .from("repair_services")
        .select("id, odometer")
        .in("id", svcIds)
        .returns<{ id: string; odometer: number | null }[]>();
      for (const s of svcRows ?? []) {
        if (s.odometer != null) odoByService.set(s.id, s.odometer);
      }
    }
    for (const p of partRows ?? []) {
      const key = groupKey(p.part_group);
      const odo = p.service_id ? odoByService.get(p.service_id) : undefined;
      if (key == null || odo == null) continue;
      maxOdoByGroup.set(key, Math.max(maxOdoByGroup.get(key) ?? 0, odo));
    }
  }
  const allMaintenance = reminders.map((m) => {
    const key = groupKey(m.part_group);
    const lastOdo =
      (key != null ? maxOdoByGroup.get(key) : undefined) ?? m.anchor_odo ?? null;
    const c = computeMaintenance(m.interval_miles, lastOdo, maintOdo);
    return {
      id: m.id,
      name: m.label,
      status: c.status,
      milesRemaining: c.milesRemaining,
      pct: c.pct,
      neverServiced: c.neverServiced,
    };
  });

  // The maintenance WIDGET stays the two-item quick view it has always been;
  // the alerts panel above draws on allMaintenance instead.
  const maintenance = allMaintenance.filter((m) =>
    DASH_MAINT_NAMES.includes(m.name),
  );

  // Countdown goals (editable targets) for the dashboard widget.
  const countdownGoals: CountdownGoal[] = (goalRows ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    subtitle: g.subtitle ?? "",
    targetAmount: num(g.target_amount),
    targetDate: g.target_date,
    createdAt: g.created_at,
  }));

  // Net-pace aggregates for the countdown breakdown — canonical loadDiesel/
  // loadNet over delivered loads in the last ~12 weeks. Weekly pace = total
  // window net ÷ WINDOW_WEEKS; average net per load = total ÷ load count.
  const fuel: FuelSettings = {
    mpg: num(fuelRow?.mpg ?? null) || FUEL_DEFAULTS.mpg,
    ppg: num(fuelRow?.diesel_price_per_gallon ?? null) || FUEL_DEFAULTS.ppg,
    factoringPct:
      fuelRow?.factoring_pct != null
        ? num(fuelRow.factoring_pct)
        : FUEL_DEFAULTS.factoringPct,
  };
  const expByLoad = new Map<string, number>();
  for (const e of expRows ?? []) {
    expByLoad.set(e.load_id, (expByLoad.get(e.load_id) ?? 0) + num(e.amount));
  }
  const factoringIds = new Set((factoringBrokers ?? []).map((b) => b.id));

  let windowNet = 0;
  let windowLoadCount = 0;
  for (const l of deliveredRows ?? []) {
    // Effective date: delivery_date when present, else created_at. Window on it.
    const effIso = l.delivery_date ?? l.created_at;
    const effMs = new Date(effIso).getTime();
    if (!Number.isFinite(effMs) || effMs < netPaceCutoffMs) continue;
    const md = loadDiesel(
      {
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
        estimate: l.loaded_miles,
      },
      fuel,
    );
    const { net } = loadNet(
      {
        rate: num(l.rate),
        diesel: md.diesel,
        expensesTotal: expByLoad.get(l.id) ?? 0,
      },
      fuel,
      l.broker_id != null && factoringIds.has(l.broker_id),
    );
    windowNet += net;
    windowLoadCount += 1;
  }
  const netPace: NetPace = {
    avgNetPerLoad: windowLoadCount > 0 ? windowNet / windowLoadCount : 0,
    weeklyNetPace: windowNet > 0 ? windowNet / NET_PACE_WINDOW_WEEKS : 0,
  };

  const alertGroups = buildAlertGroups({
    maintenance: allMaintenance,
    deliveredLoads: deliveredRows ?? [],
    docCounts,
    newApplicationCount: newApplicationCount ?? 0,
    newQuoteCount: newQuoteCount ?? 0,
    now,
  });

  return {
    newApplicationCount: newApplicationCount ?? 0,
    newQuoteCount: newQuoteCount ?? 0,
    expiredQuotes,
    activeLoads,
    maintenance,
    brokerNames,
    activeTrips,
    countdownGoals,
    netPace,
    alertGroups,
    currentCash: num(fuelRow?.current_cash ?? null),
  };
}

type DeliveredLoad = {
  id: string;
  load_number: string | null;
  rate: number | string | null;
  odo_assigned: number | null;
  odo_loaded: number | null;
  odo_delivered: number | null;
  broker_name: string | null;
  origin: string | null;
  destination: string | null;
  payment_status: string | null;
  delivery_date: string | null;
};

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function lane(l: DeliveredLoad): string {
  return `${l.origin?.trim() || "—"} → ${l.destination?.trim() || "—"}`;
}

/**
 * Assemble the "Needs attention" groups from already-fetched data.
 *
 * Every group is a pure derivation of live rows — there is no alerts table and
 * nothing to dismiss. Fixing the underlying thing (log the service, attach the
 * BOL, enter the odometer, mark the invoice paid, work the lead) drops the
 * alert on the next render. Empty groups are returned as-is; the panel filters
 * them out, so this stays a flat list rather than a chain of if-blocks.
 */
function buildAlertGroups({
  maintenance,
  deliveredLoads,
  docCounts,
  newApplicationCount,
  newQuoteCount,
  now,
}: {
  maintenance: ReadonlyArray<{
    id: string;
    name: string;
    status: string;
    milesRemaining: number | null;
  }>;
  deliveredLoads: ReadonlyArray<DeliveredLoad>;
  docCounts: Map<string, { rate_con: number; bol: number; pod: number }>;
  newApplicationCount: number;
  newQuoteCount: number;
  now: Date;
}): AlertGroup[] {
  // (a) MAINTENANCE — every active reminder that's overdue or due soon.
  // "baseline" (never serviced) is NOT an alert: it's a setup task, not a
  // thing falling behind, and it would otherwise shout on day one forever.
  const maintItems = maintenance
    .filter((m) => m.status === "overdue" || m.status === "soon")
    .map((m) => {
      const over = m.status === "overdue";
      const mi = m.milesRemaining;
      return {
        id: m.id,
        title: m.name,
        value:
          mi == null
            ? "—"
            : mi <= 0
              ? `${Math.abs(mi).toLocaleString()} mi over`
              : `${mi.toLocaleString()} mi left`,
        chips: [
          {
            label: over ? "Overdue" : "Due soon",
            tone: over ? ("red" as const) : ("amber" as const),
          },
        ],
        href: "/admin/maintenance",
      };
    });

  // (b) OVERDUE RECEIVABLES — delivered + unpaid, aged past 40 days from the
  // delivery date. Same row set and same aging derivation as the Receivables
  // page, so the two can't disagree. Oldest first: the longest-owed money is
  // the most at risk.
  const receivableItems = deliveredLoads
    .filter((l) => l.payment_status !== "paid")
    .map((l) => ({ load: l, days: daysOutstanding(l.delivery_date, now) }))
    .filter(
      (r): r is { load: DeliveredLoad; days: number } =>
        r.days != null && r.days >= RECEIVABLE_OVERDUE_DAYS,
    )
    .sort((a, b) => b.days - a.days)
    .map(({ load, days }) => ({
      id: load.id,
      title: load.broker_name?.trim() || "No broker",
      subtitle: `#${load.load_number?.trim() || "—"} · ${lane(load)}`,
      value: usd(num(load.rate)),
      chips: [{ label: `${days}d out`, tone: "red" as const }],
      href: `/admin/dispatch/loads/${load.id}`,
    }));

  // (c) INCOMPLETE LOADS — delivered loads the owner never finished filling
  // in: missing a rate con or BOL, or missing the odometer readings the net
  // calc runs on. Each item names exactly what's absent so the tap-through is
  // a to-do, not a scavenger hunt.
  const incompleteItems = deliveredLoads
    .map((l) => {
      const docs = docCounts.get(l.id) ?? { rate_con: 0, bol: 0, pod: 0 };
      const gaps = incompleteGaps({
        hasRateCon: docs.rate_con > 0,
        hasBol: docs.bol > 0,
        odoAssigned: l.odo_assigned,
        odoLoaded: l.odo_loaded,
        odoDelivered: l.odo_delivered,
      });
      return { load: l, gaps };
    })
    .filter((r) => r.gaps.length > 0)
    .map(({ load, gaps }) => ({
      id: load.id,
      title: load.broker_name?.trim() || "No broker",
      subtitle: `#${load.load_number?.trim() || "—"} · ${lane(load)}`,
      chips: gaps.map((g) => ({ label: GAP_LABEL[g], tone: "amber" as const })),
      href: `/admin/dispatch/loads/${load.id}`,
    }));

  // (d) The two original signals, preserved as their own groups. These are
  // counts rather than row sets — the tab they link to IS the list — so each
  // renders as a single summary item.
  const applicationItems =
    newApplicationCount > 0
      ? [
          {
            id: "applications",
            title: `${newApplicationCount} new job application${newApplicationCount === 1 ? "" : "s"}`,
            subtitle: "Received in the last 24 hours",
            href: "/admin/operations?tab=applications",
          },
        ]
      : [];

  const quoteItems =
    newQuoteCount > 0
      ? [
          {
            id: "quotes",
            title: `${newQuoteCount} new quote request${newQuoteCount === 1 ? "" : "s"}`,
            subtitle: "Not yet contacted",
            href: "/admin/operations?tab=quotes",
          },
        ]
      : [];

  return [
    { key: "maintenance", label: "Maintenance", tone: "red", items: maintItems },
    {
      key: "receivables",
      label: "Overdue receivables",
      tone: "red",
      items: receivableItems,
    },
    {
      key: "incomplete",
      label: "Incomplete loads",
      tone: "amber",
      items: incompleteItems,
    },
    {
      key: "applications",
      label: "New applications",
      tone: "amber",
      items: applicationItems,
    },
    { key: "quotes", label: "New quote requests", tone: "amber", items: quoteItems },
  ];
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
