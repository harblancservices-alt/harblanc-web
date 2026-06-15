import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recentAgeLabel } from "@/lib/dispatch/dashboard-view";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";
import { formatLoadRate } from "@/lib/dispatch/loads-view";
import { DashboardView, type DashboardData } from "./DashboardView";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/**
 * Owner Dashboard — opportunity inbox.
 *
 * HARBLANC is a small operation, so the dashboard answers one question:
 * "what quote requests do I have right now?" It shows incoming quote
 * requests as compact cards (name + lane + mileage) with new ones
 * flagged, and keeps job applications in their own separate area below.
 * No KPI walls, no dense tables — just the live opportunities.
 */

type LeadRow = {
  id: string;
  created_at: string;
  name: string | null;
  lead_status: string;
  first_viewed_at: string | null;
  commodity: string | null;
  weight: string | number | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_zip: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  calculated_miles: number | string | null;
};

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

// Closed-out leads never appear on the pipeline.
const CLOSED_STATUSES = new Set(["archived", "lost"]);

type PipelineStage =
  | "new"
  | "quote"
  | "quote_sent"
  | "send_finalized"
  | "awaiting_payment"
  | "booked";

// Which pipeline column a quote sits in:
//   New              = never opened — hasn't been looked at yet
//   Quote            = opened, but no range proposal sent yet (build/send it)
//   Quote sent       = range proposal out, waiting on the customer to accept
//   Send finalized   = customer accepted — send the finalized quote
//   Awaiting payment = finalized quote sent, waiting on the deposit
//   Booked           = paid and rolling (dispatch → delivered)
function stageFor(status: string, viewed: boolean): PipelineStage {
  if (status === "new" || status === "contacted") {
    return viewed ? "quote" : "new";
  }
  if (status === "estimate_sent") return "quote_sent";
  if (status === "awaiting_confirmation") return "send_finalized";
  if (status === "booked" || status === "awaiting_payment") {
    return "awaiting_payment";
  }
  return "booked";
}

function placeLabel(city: string | null, state: string | null): string {
  const parts: string[] = [];
  if (city && city.trim()) parts.push(city.trim());
  if (state && state.trim()) parts.push(state.trim());
  return parts.join(", ");
}

function coerceMiles(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatWeight(v: string | number | null): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    const s = String(v).trim();
    return s || "—";
  }
  return Math.round(n).toLocaleString() + " lbs";
}

// "Fri, Jun 13, 2026" — full date shown alongside the age on each card.
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

  const [{ data: leadRows }, { data: appRows }] = await Promise.all([
    sb
      .from("quote_requests")
      .select(
        "id, created_at, name, lead_status, first_viewed_at, commodity, weight, pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip, calculated_miles",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60)
      .returns<LeadRow[]>(),
    sb
      .from("applications")
      .select(
        "id, created_at, name, equipment_type, cdl_status, phone, email, years_experience, home_base",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<ApplicationRow[]>(),
  ]);

  const openLeads = (leadRows ?? []).filter(
    (l) => !CLOSED_STATUSES.has(l.lead_status),
  );

  // Latest sent estimate per open lead — drives the 24h follow-up flag and
  // the 48h "expired" flag (expiration_at is the quote's validity window;
  // accepted_at tells us the customer already took it, so it can't expire).
  const latestEstSent = new Map<string, string>();
  const latestEstExpires = new Map<string, string | null>();
  const latestEstAccepted = new Map<string, string | null>();
  const latestEstLow = new Map<string, number | null>();
  const latestEstHigh = new Map<string, number | null>();
  const openIds = openLeads.map((l) => l.id);
  if (openIds.length > 0) {
    const { data: estRows } = await sb
      .from("dispatch_estimates")
      .select(
        "quote_request_id, sent_at, expiration_at, accepted_at, linehaul_low, linehaul_high",
      )
      .in("quote_request_id", openIds)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .returns<
        {
          quote_request_id: string;
          sent_at: string | null;
          expiration_at: string | null;
          accepted_at: string | null;
          linehaul_low: number | null;
          linehaul_high: number | null;
        }[]
      >();
    for (const e of estRows ?? []) {
      if (e.sent_at && !latestEstSent.has(e.quote_request_id)) {
        latestEstSent.set(e.quote_request_id, e.sent_at);
        latestEstExpires.set(e.quote_request_id, e.expiration_at);
        latestEstAccepted.set(e.quote_request_id, e.accepted_at);
        latestEstLow.set(e.quote_request_id, e.linehaul_low ?? null);
        latestEstHigh.set(e.quote_request_id, e.linehaul_high ?? null);
      }
    }
  }

  // Latest finalized-quote total per lead — the confirmed price shown on the
  // money-stage cards (Awaiting payment / Booked).
  const latestFqTotal = new Map<string, number>();
  if (openIds.length > 0) {
    const { data: fqRows } = await sb
      .from("finalized_quotes")
      .select("quote_request_id, total_amount, sent_at")
      .in("quote_request_id", openIds)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .returns<
        {
          quote_request_id: string;
          total_amount: number | string | null;
          sent_at: string | null;
        }[]
      >();
    for (const f of fqRows ?? []) {
      if (latestFqTotal.has(f.quote_request_id)) continue;
      const t = f.total_amount == null ? null : Number(f.total_amount);
      if (t != null && Number.isFinite(t)) latestFqTotal.set(f.quote_request_id, t);
    }
  }

  const FOLLOWUP_MS = 24 * 60 * 60 * 1000;

  const quoteRequests = openLeads.slice(0, 24).map((l) => {
    const oZip = l.pickup_zip?.trim() ?? "";
    const dZip = l.delivery_zip?.trim() ?? "";
    // City/state and lane miles are derived from the ZIP via the
    // `zipcodes` dataset (same source the load-detail page uses) because
    // the quote_requests columns aren't populated. Fall back to any
    // stored value, then to blank.
    const oLook = oZip ? lookupZip(oZip) : null;
    const dLook = dZip ? lookupZip(dZip) : null;
    const lane = oZip && dZip ? estimateLaneMiles(oZip, dZip) : null;
    const miles = lane && lane.ok ? lane.miles : coerceMiles(l.calculated_miles);

    const stage = stageFor(l.lead_status, l.first_viewed_at != null);

    // Status colour, simplest rules (highest priority first):
    //   expired = quote sent, its 48h validity lapsed, never accepted (dead)
    //   unseen  = never opened by the owner (first_viewed_at is null)
    //   followup = opened, estimate sent 24h+ ago and still in play
    //   ok      = everything else
    const sentAt = latestEstSent.get(l.id);
    const expiresAt = latestEstExpires.get(l.id) ?? null;
    const acceptedAt = latestEstAccepted.get(l.id) ?? null;
    const needsFollowUp =
      sentAt != null && now.getTime() - new Date(sentAt).getTime() >= FOLLOWUP_MS;
    const isExpired =
      stage === "quote_sent" &&
      acceptedAt == null &&
      expiresAt != null &&
      now.getTime() > new Date(expiresAt).getTime();

    const status: "unseen" | "followup" | "expired" | "ok" = isExpired
      ? "expired"
      : l.first_viewed_at == null
        ? "unseen"
        : needsFollowUp
          ? "followup"
          : "ok";

    const priceDisplay = formatLoadRate({
      finalizedTotal: latestFqTotal.get(l.id) ?? null,
      estimateLow: latestEstLow.get(l.id) ?? null,
      estimateHigh: latestEstHigh.get(l.id) ?? null,
    });

    return {
      leadId: l.id,
      name: l.name?.trim() || "Unnamed request",
      ageLabel: recentAgeLabel(l.created_at, now),
      dateLabel: fullDate(l.created_at),
      status,
      stage,
      commodity: l.commodity?.trim() || "—",
      weight: formatWeight(l.weight),
      priceDisplay,
      originZip: oZip || "—",
      originPlace:
        (oLook ? placeLabel(oLook.city, oLook.state) : "") ||
        placeLabel(l.pickup_city, l.pickup_state),
      destZip: dZip || "—",
      destPlace:
        (dLook ? placeLabel(dLook.city, dLook.state) : "") ||
        placeLabel(l.delivery_city, l.delivery_state),
      miles,
    };
  });

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

  // Expired quotes drop off the forward pipeline into their own section.
  const pipelineQuotes = quoteRequests.filter((q) => q.status !== "expired");
  const expiredQuotes = quoteRequests.filter((q) => q.status === "expired");

  // Active dispatch loads (not delivered/cancelled) for the at-a-glance card.
  const { data: loadRows } = await sb
    .from("loads")
    .select("id, broker_name, origin, destination, rate, status")
    .is("deleted_at", null)
    .in("status", ["pending", "assigned", "loaded"])
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<{
      id: string;
      broker_name: string | null;
      origin: string | null;
      destination: string | null;
      rate: number | string | null;
      status: string;
    }[]>();
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

  return { quoteRequests: pipelineQuotes, expiredQuotes, applications, activeLoads };
}

export default async function DashboardPage() {
  const data = await loadDashboard();
  return <DashboardView data={data} />;
}
