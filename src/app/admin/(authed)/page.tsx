import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";
import {
  computeMaintenance,
  currentOdoFromLoads,
} from "@/lib/dispatch/maintenance";
import { DashboardView, type DashboardData } from "./DashboardView";

// The two items surfaced on the dashboard's quick maintenance widget.
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
    { data: maintRows },
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
      .select("id, broker_name, origin, destination, rate, status")
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
    // Maintenance widget: oil + fuel filters only.
    sb
      .from("maintenance_items")
      .select("id, name, interval_miles, last_service_odo")
      .is("deleted_at", null)
      .in("name", DASH_MAINT_NAMES)
      .order("sort_order", { ascending: true })
      .returns<
        {
          id: string;
          name: string;
          interval_miles: number;
          last_service_odo: number | null;
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

  // POD counts for the active loads, so the dashboard's per-load "Add POD"
  // action can reflect how many proof-of-delivery files are already attached.
  const activeLoadIds = (loadRows ?? []).map((l) => l.id);
  const podByLoad = new Map<string, number>();
  if (activeLoadIds.length > 0) {
    const { data: podRows } = await sb
      .from("load_documents")
      .select("load_id")
      .eq("kind", "pod")
      .in("load_id", activeLoadIds)
      .returns<{ load_id: string }[]>();
    for (const r of podRows ?? []) {
      podByLoad.set(r.load_id, (podByLoad.get(r.load_id) ?? 0) + 1);
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
    return {
      id: l.id,
      broker: l.broker_name?.trim() || "No broker",
      lane: `${l.origin?.trim() || "—"} → ${l.destination?.trim() || "—"}`,
      status: l.status,
      rateDisplay: "$" + Math.round(rateN).toLocaleString("en-US"),
      podCount: podByLoad.get(l.id) ?? 0,
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

  // Maintenance widget — oil + fuel filters against the truck's current
  // odometer (highest reading across non-deleted loads).
  const maintOdo = currentOdoFromLoads(odoRows);
  const maintenance = (maintRows ?? []).map((m) => {
    const c = computeMaintenance(m.interval_miles, m.last_service_odo, maintOdo);
    return {
      id: m.id,
      name: m.name,
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
