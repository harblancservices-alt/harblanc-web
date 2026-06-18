import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recentAgeLabel } from "@/lib/dispatch/dashboard-view";
import { lookupZip } from "@/lib/dispatch/distance";
import { loadPipelineCards } from "@/lib/dispatch/pipeline";
import { DashboardView, type DashboardData } from "./DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Owner Dashboard — opportunity inbox.
 *
 * The quote pipeline funnel now lives at the top of the Quotes page
 * (QuotesPipeline + loadPipelineCards). The dashboard keeps job
 * applications, active loads, and the "Expired quotes" table — the last of
 * which still derives from the shared pipeline cards.
 */

type ApplicationRow = {
  id: string;
  created_at: string;
  name: string | null;
  equipment_type: string | null;
  cdl_status: string | null;
  phone: string | null;
  email: string | null;
  years_experience: string | number | null;
  home_base: string | null;
};

function placeLabel(city: string | null, state: string | null): string {
  const parts: string[] = [];
  if (city && city.trim()) parts.push(city.trim());
  if (state && state.trim()) parts.push(state.trim());
  return parts.join(", ");
}

// "Fri, Jun 13, 2026" — full date shown alongside the age on each row.
function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function loadDashboard(): Promise<DashboardData> {
  const sb = createServiceRoleClient();
  const now = new Date();

  const [
    pipelineCards,
    { data: appRows },
    { data: loadRows },
    { data: brokerRows },
    { data: tripRows },
  ] = await Promise.all([
    // Shared pipeline cards — the dashboard only renders the expired ones.
    loadPipelineCards(),
    sb
      .from("applications")
      .select(
        "id, created_at, name, equipment_type, cdl_status, phone, email, years_experience, home_base",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<ApplicationRow[]>(),
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
  ]);

  // Expired quotes drop off the forward pipeline into their own section.
  const expiredQuotes = pipelineCards.filter((c) => c.status === "expired");

  const applications = (appRows ?? []).map((a) => {
    const yrs =
      typeof a.years_experience === "number"
        ? String(a.years_experience)
        : (a.years_experience ?? "").toString().trim();
    // Home base will be entered as a ZIP later; show it as City, State when
    // it parses as a ZIP, otherwise show whatever's stored.
    const hb = a.home_base?.trim() || "";
    let homeBase = hb || "—";
    if (/^\d{5}(-\d{4})?$/.test(hb)) {
      const z = lookupZip(hb);
      if (z) homeBase = placeLabel(z.city, z.state) || hb;
    }
    return {
      id: a.id,
      name: a.name?.trim() || "Applicant",
      equipment: a.equipment_type?.trim() || a.cdl_status?.trim() || "—",
      experience: yrs ? yrs + "y" : "—",
      phone: a.phone?.trim() || "—",
      email: a.email?.trim() || "—",
      homeBase,
      ageLabel: recentAgeLabel(a.created_at, now),
      dateLabel: fullDate(a.created_at),
    };
  });

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

  return {
    expiredQuotes,
    applications,
    activeLoads,
    brokerNames,
    activeTrips,
  };
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
