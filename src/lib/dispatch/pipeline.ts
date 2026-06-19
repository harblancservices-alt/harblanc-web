import { createServiceRoleClient } from "@/lib/supabase/server";
import { recentAgeLabel } from "@/lib/dispatch/dashboard-view";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";
import { formatLoadRate } from "@/lib/dispatch/loads-view";

/**
 * Quote pipeline cards — the funnel that used to sit at the top of the
 * dashboard, now rendered at the top of the Quotes page. One card per open
 * lead (capped at 24), tagged with its pipeline stage and an urgency status,
 * plus the lane / price context the cards show.
 *
 * Returns ALL cards including expired ones (status === "expired"); callers
 * filter: the Quotes pipeline drops expired, the dashboard's "Expired
 * quotes" table keeps only those.
 */

export type PipelineStatus = "unseen" | "followup" | "expired" | "ok";
export type PipelineStage =
  | "new"
  | "quote"
  | "quote_sent"
  | "send_finalized"
  | "awaiting_payment"
  | "booked";

export type PipelineCard = {
  leadId: string;
  name: string;
  ageLabel: string;
  dateLabel: string;
  status: PipelineStatus;
  stage: PipelineStage;
  commodity: string;
  weight: string;
  priceDisplay: string | null;
  originZip: string;
  originPlace: string;
  destZip: string;
  destPlace: string;
  miles: number | null;
};

export const PIPELINE_STAGES: ReadonlyArray<{
  key: PipelineStage;
  label: string;
}> = [
  { key: "new", label: "New" },
  { key: "quote", label: "Quote" },
  { key: "quote_sent", label: "Quote sent" },
  { key: "send_finalized", label: "Send finalized" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "booked", label: "Booked" },
];

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

// Closed-out leads never appear on the pipeline.
const CLOSED_STATUSES = new Set(["archived", "lost"]);

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

export async function loadPipelineCards(): Promise<PipelineCard[]> {
  const sb = createServiceRoleClient();
  const now = new Date();

  const { data: leadRows } = await sb
    .from("quote_requests")
    .select(
      "id, created_at, name, lead_status, first_viewed_at, commodity, weight, pickup_city, pickup_state, pickup_zip, delivery_city, delivery_state, delivery_zip, calculated_miles",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<LeadRow[]>();

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
  // Latest finalized-quote total per lead — the confirmed price shown on the
  // money-stage cards (Awaiting payment / Booked).
  const latestFqTotal = new Map<string, number>();

  const openIds = openLeads.map((l) => l.id);
  if (openIds.length > 0) {
    // Estimates and finalized quotes both only depend on openIds, so fetch
    // them together in one round-trip pair instead of sequentially.
    const [{ data: estRows }, { data: fqRows }] = await Promise.all([
      sb
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
        >(),
      sb
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
        >(),
    ]);

    for (const e of estRows ?? []) {
      if (e.sent_at && !latestEstSent.has(e.quote_request_id)) {
        latestEstSent.set(e.quote_request_id, e.sent_at);
        latestEstExpires.set(e.quote_request_id, e.expiration_at);
        latestEstAccepted.set(e.quote_request_id, e.accepted_at);
        latestEstLow.set(e.quote_request_id, e.linehaul_low ?? null);
        latestEstHigh.set(e.quote_request_id, e.linehaul_high ?? null);
      }
    }

    for (const f of fqRows ?? []) {
      if (latestFqTotal.has(f.quote_request_id)) continue;
      const t = f.total_amount == null ? null : Number(f.total_amount);
      if (t != null && Number.isFinite(t)) {
        latestFqTotal.set(f.quote_request_id, t);
      }
    }
  }

  const FOLLOWUP_MS = 24 * 60 * 60 * 1000;

  return openLeads.slice(0, 24).map((l) => {
    const oZip = l.pickup_zip?.trim() ?? "";
    const dZip = l.delivery_zip?.trim() ?? "";
    const oLook = oZip ? lookupZip(oZip) : null;
    const dLook = dZip ? lookupZip(dZip) : null;
    const lane = oZip && dZip ? estimateLaneMiles(oZip, dZip) : null;
    const miles = lane && lane.ok ? lane.miles : coerceMiles(l.calculated_miles);

    const stage = stageFor(l.lead_status, l.first_viewed_at != null);

    const sentAt = latestEstSent.get(l.id);
    const expiresAt = latestEstExpires.get(l.id) ?? null;
    const acceptedAt = latestEstAccepted.get(l.id) ?? null;
    const needsFollowUp =
      sentAt != null &&
      now.getTime() - new Date(sentAt).getTime() >= FOLLOWUP_MS;
    const isExpired =
      stage === "quote_sent" &&
      acceptedAt == null &&
      expiresAt != null &&
      now.getTime() > new Date(expiresAt).getTime();

    const status: PipelineStatus = isExpired
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
}
