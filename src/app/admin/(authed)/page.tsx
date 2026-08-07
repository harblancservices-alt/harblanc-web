import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/admin/demo";
import { demoDashboard } from "@/lib/demo/demoData";
import { fetchOpenTripNames } from "@/lib/dispatch/active-trips";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";
import {
  computeMaintenance,
  currentOdoFromSources,
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
  alertKey,
  maintenanceAlertKey,
  daysOutstanding,
  loadDateLabel,
  incompleteGaps,
  GAP_LABEL,
  expenseGaps,
  EXPENSE_GAP_LABEL,
  incompleteExpenseAlertKey,
  RECEIVABLE_OVERDUE_DAYS,
  type AlertGroup,
  type IncompleteGap,
} from "@/lib/dispatch/alerts";
import { isFrequency, FREQUENCY_LABEL } from "./expenses/types";
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

// Live read off loads, receivables, and maintenance. Render fresh every visit
// so active loads, the net pace, and alerts track the current DB instead of a
// cached route snapshot.
export const dynamic = "force-dynamic";

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
  // DEMO MODE: return the static fake dataset and never touch Supabase.
  if (await isDemoMode()) return demoDashboard();

  const sb = createServiceRoleClient();
  const now = new Date();
  const appCutoff = new Date(
    now.getTime() - NEW_APPLICATION_WINDOW_MS,
  ).toISOString();
  const netPaceCutoffMs = now.getTime() - NET_PACE_WINDOW_MS;

  const [
    pipelineCards,
    { data: newApplicationRows },
    { data: newQuoteRows },
    { data: loadRows },
    { data: brokerRows },
    activeTrips,
    { data: reminderRows },
    { data: odoRows },
    { data: serviceOdoRows },
    { data: goalRows },
    { data: deliveredRows },
    { data: fuelRow },
    { data: expRows },
    { data: factoringBrokers },
    { data: docRows },
    { data: recurringExpenseRows },
    { data: expenseAccountRows },
    { data: dismissedRows },
  ] = await Promise.all([
    // Shared pipeline cards — the dashboard only renders the expired ones.
    loadPipelineCards(),
    // New job applications: active + received in the last 24h. Rows rather
    // than a bare count, so each one is an individually dismissible alert
    // (a dismissal needs a stable per-row key — see alertKey()).
    sb
      .from("applications")
      .select("id, name, created_at")
      .is("deleted_at", null)
      .gte("created_at", appCutoff)
      .order("created_at", { ascending: false })
      .returns<{ id: string; name: string | null; created_at: string }[]>(),
    // New quote requests: active + still at the default 'new' lead_status.
    sb
      .from("quote_requests")
      .select("id, name, created_at")
      .is("deleted_at", null)
      .eq("lead_status", "new")
      .order("created_at", { ascending: false })
      .returns<{ id: string; name: string | null; created_at: string }[]>(),
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
    // Logged maintenance/service odometers — also fold into current odometer
    // (currentOdoFromSources): a service can be logged at a higher reading
    // than any load has recorded.
    sb.from("repair_services").select("odometer").returns<{ odometer: number | null }[]>(),
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
        "id, load_number, rate, loaded_miles, odo_assigned, odo_loaded, odo_delivered, broker_id, broker_name, origin, destination, payment_status, delivery_date, pickup_date, created_at",
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
          pickup_date: string | null;
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
    // Active (non-archived, non-deleted) recurring expenses — same exclusion
    // the Expenses page KPIs use, so an archived expense never alerts.
    sb
      .from("recurring_expenses")
      .select(
        "id, name, vendor, category, amount, frequency, day_of_month, day_of_week, start_date, card",
      )
      .is("deleted_at", null)
      .eq("archived", false)
      .returns<
        {
          id: string;
          name: string;
          vendor: string | null;
          category: string | null;
          amount: number | string | null;
          frequency: string | null;
          day_of_month: number | null;
          day_of_week: string | null;
          start_date: string | null;
          card: string | null;
        }[]
      >(),
    // Account/card names — the expense's `card` links here by name string, so
    // this is what tells a missing card apart from an unrecognized one.
    sb
      .from("expense_accounts")
      .select("name")
      .is("deleted_at", null)
      .returns<{ name: string }[]>(),
    // Alerts the owner has swiped away. Errors are swallowed below rather than
    // thrown: this table ships as a migration applied to the remote DB
    // separately, and the dashboard must render fine before it lands.
    sb
      .from("dismissed_alerts")
      .select("alert_key")
      .returns<{ alert_key: string }[]>(),
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
  // current odometer (highest reading across non-deleted loads AND logged
  // service odometers — currentOdoFromSources). Each reminder's last-done
  // odometer is the highest reading among the SERVICES of the parts in its
  // part_group, falling back to its anchor baseline.
  const maintOdo = currentOdoFromSources(odoRows, (serviceOdoRows ?? []).map((s) => s.odometer));
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
      // Carried for the alert's per-occurrence dismissal key: when this moves,
      // the item has been serviced and any old dismissal stops applying.
      lastOdo,
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

  // Dismissed alerts. `dismissedRows` is null both when the table is empty and
  // when it doesn't exist yet (the query errors, Promise.all still resolves
  // with data: null) — either way the correct reading is "nothing dismissed",
  // so no special-casing is needed here.
  const dismissed = new Set((dismissedRows ?? []).map((d) => d.alert_key));

  const alertGroups = buildAlertGroups({
    maintenance: allMaintenance,
    deliveredLoads: deliveredRows ?? [],
    docCounts,
    recurringExpenses: recurringExpenseRows ?? [],
    expenseAccountNames: new Set((expenseAccountRows ?? []).map((a) => a.name)),
    newApplications: newApplicationRows ?? [],
    newQuotes: newQuoteRows ?? [],
    now,
    dismissed,
  });

  return {
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
  pickup_date: string | null;
};

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function lane(l: DeliveredLoad): string {
  return `${l.origin?.trim() || "—"} → ${l.destination?.trim() || "—"}`;
}

/**
 * The quick action for an incomplete load — one button, so it targets the
 * gap the owner is most likely to be able to close right now.
 *
 * Missing paperwork wins over a missing odometer: both doc kinds land on the
 * same uploader (#documents), and a BOL/rate con is a file he either has or
 * doesn't, whereas the odometer needs the reading to hand. Between the two
 * docs, BOL leads — it's the one that proves delivery. An odometer-only gap
 * gets its own deep link to the odometer card.
 */
function incompleteAction(
  loadId: string,
  gaps: ReadonlyArray<IncompleteGap>,
): { label: string; href: string } {
  const base = `/admin/dispatch/loads/${loadId}`;
  if (gaps.includes("bol")) return { label: "BOL", href: `${base}#documents` };
  if (gaps.includes("rate_con"))
    return { label: "Rate Con", href: `${base}#documents` };
  return { label: "Odometer", href: `${base}#odometer` };
}

/**
 * Assemble the "Needs attention" groups from already-fetched data.
 *
 * Every group is a pure derivation of live rows. Fixing the underlying thing
 * (log the service, attach the BOL, enter the odometer, mark the invoice paid,
 * work the lead) drops the alert on the next render. Empty groups are returned
 * as-is; the panel filters them out, so this stays a flat list rather than a
 * chain of if-blocks.
 *
 * The one bit of stored state is `dismissed` — alerts the owner swiped away.
 * It's applied here, at the end, so a dismissal is subtracted from the group
 * counts and therefore from the badge total automatically; nothing downstream
 * has to know dismissals exist.
 */
function buildAlertGroups({
  maintenance,
  deliveredLoads,
  docCounts,
  recurringExpenses,
  expenseAccountNames,
  newApplications,
  newQuotes,
  now,
  dismissed,
}: {
  maintenance: ReadonlyArray<{
    id: string;
    name: string;
    status: string;
    milesRemaining: number | null;
    lastOdo: number | null;
  }>;
  deliveredLoads: ReadonlyArray<DeliveredLoad>;
  docCounts: Map<string, { rate_con: number; bol: number; pod: number }>;
  recurringExpenses: ReadonlyArray<{
    id: string;
    name: string;
    vendor: string | null;
    category: string | null;
    amount: number | string | null;
    frequency: string | null;
    day_of_month: number | null;
    day_of_week: string | null;
    start_date: string | null;
    card: string | null;
  }>;
  expenseAccountNames: ReadonlySet<string>;
  newApplications: ReadonlyArray<{ id: string; name: string | null }>;
  newQuotes: ReadonlyArray<{ id: string; name: string | null }>;
  now: Date;
  dismissed: ReadonlySet<string>;
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
        // Per-occurrence, not permanent — see maintenanceAlertKey().
        dismissKey: maintenanceAlertKey(m.id, m.lastOdo, m.status),
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
        // Straight into the log-a-service form, prefilled for this reminder.
        action: {
          label: "Log Service",
          href: `/admin/maintenance?log=${encodeURIComponent(m.id)}`,
        },
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
      dismissKey: alertKey("receivables", load.id),
      title: load.broker_name?.trim() || "No broker",
      subtitle: `#${load.load_number?.trim() || "—"} · ${lane(load)}`,
      value: usd(num(load.rate)),
      chips: [{ label: `${days}d out`, tone: "red" as const }],
      dateLabel: loadDateLabel(load.delivery_date, load.pickup_date, now),
      href: `/admin/dispatch/loads/${load.id}`,
      action: { label: "Open", href: `/admin/dispatch/loads/${load.id}` },
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
      dismissKey: alertKey("incomplete", load.id),
      title: load.broker_name?.trim() || "No broker",
      subtitle: `#${load.load_number?.trim() || "—"} · ${lane(load)}`,
      chips: gaps.map((g) => ({ label: GAP_LABEL[g], tone: "amber" as const })),
      dateLabel: loadDateLabel(load.delivery_date, load.pickup_date, now),
      href: `/admin/dispatch/loads/${load.id}`,
      action: incompleteAction(load.id, gaps),
    }));

  // (c.1) INCOMPLETE EXPENSES — active recurring expenses saved without
  // enough to know what they are or when they charge. There's no per-row
  // deep link on the Expenses page, so every item opens the list itself
  // rather than a specific row.
  const incompleteExpenseItems = recurringExpenses
    .map((e) => {
      const amount = num(e.amount);
      const gaps = expenseGaps(
        {
          amount: e.amount == null ? null : amount,
          frequency: e.frequency ?? "monthly",
          dayOfMonth: e.day_of_month,
          dayOfWeek: e.day_of_week,
          startDate: e.start_date,
          card: e.card,
          category: e.category,
        },
        expenseAccountNames,
      );
      return { expense: e, amount, gaps };
    })
    .filter((r) => r.gaps.length > 0)
    .map(({ expense, amount, gaps }) => {
      const freqRaw = expense.frequency ?? "";
      const freq = isFrequency(freqRaw) ? freqRaw : "monthly";
      return {
        id: expense.id,
        dismissKey: incompleteExpenseAlertKey(expense.id, gaps),
        title: expense.name?.trim() || expense.vendor?.trim() || "Unnamed expense",
        subtitle: `Recurring expense · ${FREQUENCY_LABEL[freq]}`,
        value: gaps.includes("amount") ? undefined : usd(amount),
        chips: gaps.map((g) => ({ label: EXPENSE_GAP_LABEL[g], tone: "amber" as const })),
        href: "/admin/expenses",
        action: { label: "Open", href: "/admin/expenses" },
      };
    });

  // (d) The two original signals. One item per row rather than one summary
  // row per group: a dismissal has to key to something stable, and "3 new
  // applications" has no such identity — dismissing it could only mean
  // silencing the whole signal forever. Per-row means the owner can ignore
  // one junk lead and still see the next real one.
  const applicationItems = newApplications.map((a) => ({
    id: a.id,
    dismissKey: alertKey("applications", a.id),
    title: a.name?.trim() || "New applicant",
    subtitle: "Job application · last 24 hours",
    href: "/admin/operations?tab=applications",
    action: { label: "Open", href: "/admin/operations?tab=applications" },
  }));

  const quoteItems = newQuotes.map((q) => ({
    id: q.id,
    dismissKey: alertKey("quotes", q.id),
    title: q.name?.trim() || "New quote request",
    subtitle: "Not yet contacted",
    href: "/admin/operations?tab=quotes",
    action: { label: "Open", href: "/admin/operations?tab=quotes" },
  }));

  const groups: AlertGroup[] = [
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
      key: "expenses",
      label: "Incomplete expenses",
      tone: "amber",
      items: incompleteExpenseItems,
    },
    {
      key: "applications",
      label: "New applications",
      tone: "amber",
      items: applicationItems,
    },
    { key: "quotes", label: "New quote requests", tone: "amber", items: quoteItems },
  ];

  // Subtract what the owner has swiped away. Doing it once here — rather than
  // in each builder — means the badge total, the group counts and the item
  // lists can't disagree about what's dismissed.
  return groups.map((g) => ({
    ...g,
    items: g.items.filter((i) => !dismissed.has(i.dismissKey)),
  }));
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
