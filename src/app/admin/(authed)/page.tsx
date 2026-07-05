import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";
import {
  computeMaintenance,
  currentOdoFromLoads,
  groupKey,
} from "@/lib/dispatch/repair-log";
import { DashboardView, type DashboardData } from "./DashboardView";

// The two reminders surfaced on the dashboard's quick maintenance widget
// (matched by their repair_reminders label, carried over from the old item
// names in the repair-log migration).
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

async function loadDashboard(): Promise<DashboardData> {
  const sb = createServiceRoleClient();
  const now = new Date();
  const appCutoff = new Date(
    now.getTime() - NEW_APPLICATION_WINDOW_MS,
  ).toISOString();

  const [
    pipelineCards,
    { count: newApplicationCount },
    { count: newQuoteCount },
    { data: loadRows },
    { data: brokerRows },
    { data: tripRows },
    { data: reminderRows },
    { data: odoRows },
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
    sb
      .from("trips")
      .select("name")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .returns<{ name: string | null }[]>(),
    // Maintenance widget: oil + fuel-filter reminders only.
    sb
      .from("repair_reminders")
      .select("id, label, part_group, interval_miles, anchor_odo")
      .is("dismissed_at", null)
      .in("label", DASH_MAINT_NAMES)
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
  ]);

  // Expired quotes drop off the forward pipeline into their own section.
  const expiredQuotes = pipelineCards.filter((c) => c.status === "expired");

  // Per-kind document counts for the active loads, so each load's Rate Con /
  // BOL / POD button reflects how many files are already attached. One query
  // for all three kinds.
  const activeLoadIds = (loadRows ?? []).map((l) => l.id);
  const docCounts = new Map<string, { rate_con: number; bol: number; pod: number }>();
  if (activeLoadIds.length > 0) {
    const { data: docRows } = await sb
      .from("load_documents")
      .select("load_id, kind")
      .in("kind", ["rate_con", "bol", "pod"])
      .in("load_id", activeLoadIds)
      .returns<{ load_id: string; kind: "rate_con" | "bol" | "pod" }[]>();
    for (const r of docRows ?? []) {
      const c =
        docCounts.get(r.load_id) ?? { rate_con: 0, bol: 0, pod: 0 };
      c[r.kind] += 1;
      docCounts.set(r.load_id, c);
    }
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
  const activeTrips = (tripRows ?? [])
    .map((t) => t.name?.trim() ?? "")
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
  const maintenance = reminders.map((m) => {
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

  return {
    newApplicationCount: newApplicationCount ?? 0,
    newQuoteCount: newQuoteCount ?? 0,
    expiredQuotes,
    activeLoads,
    maintenance,
    brokerNames,
    activeTrips,
  };
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
