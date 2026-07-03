import "server-only";

/**
 * Backhaul Reach — auto-logic (server-side reads; no "use server"). Turns the
 * operator's loads + farmed brokers into a ready-to-send outreach:
 *
 *   detectPosture()   — in-transit load → Planning (market = destination);
 *                       else last delivered / none → Available (market = last
 *                       drop). Returns the anchor town used for {town_paren}.
 *   matchMarket()     — nearest reach_market whose center is within its radius
 *                       of a lat/long.
 *   buildTownParen()  — "(Kingwood, 22 mi NE)" from market center → town, gated
 *                       by the show-exact-town setting.
 *   buildRecipients() — farmed brokers whose lanes/loads touch the market and
 *                       who have an email, pre-selected + warmth-tagged; those
 *                       reached within N days held back with "reached Nd ago".
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/dispatch/distance";
import { compass8, haversineMiles, townParen } from "@/lib/reach/geo";
import type {
  Posture,
  ReachMarket,
  ReachRecipient,
  Warmth,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** How recently a broker was reached before we hold them back by default. */
export const DEFAULT_SUPPRESS_DAYS = 4;

// ── Market matching ──────────────────────────────────────────────────────────

export type MarketMatch = { market: ReachMarket; distanceMi: number };

/**
 * Nearest market whose center is within its own radius of the point. Markets
 * missing coordinates are skipped. Null when the point falls in no market.
 */
export function matchMarket(
  lat: number,
  lon: number,
  markets: ReachMarket[],
): MarketMatch | null {
  let best: MarketMatch | null = null;
  for (const m of markets) {
    if (m.centerLat == null || m.centerLon == null) continue;
    const d = haversineMiles(lat, lon, m.centerLat, m.centerLon);
    if (d <= m.radiusMi && (!best || d < best.distanceMi)) {
      best = { market: m, distanceMi: d };
    }
  }
  return best;
}

/** State (e.g. "TX") a market sits in, from its center ZIP. Null if unknown. */
export function marketState(market: ReachMarket): string | null {
  if (!market.centerZip) return null;
  const hit = lookupZip(market.centerZip);
  return hit?.state?.toUpperCase() ?? null;
}

/**
 * Precision parenthetical for a town relative to a market center. Returns "" —
 * so the template collapses to just the market name — when exact-town display
 * is off or coordinates are missing.
 */
export function buildTownParen(
  market: ReachMarket,
  town: string,
  townLat: number | null,
  townLon: number | null,
  showExactTown: boolean,
): string {
  if (!showExactTown) return "";
  if (
    townLat == null ||
    townLon == null ||
    market.centerLat == null ||
    market.centerLon == null
  ) {
    return town.trim() ? `(${town.trim()})` : "";
  }
  const miles = Math.round(
    haversineMiles(market.centerLat, market.centerLon, townLat, townLon),
  );
  const dir = compass8(
    market.centerLat,
    market.centerLon,
    townLat,
    townLon,
  );
  return townParen(town, miles, dir);
}

// ── Posture detection ────────────────────────────────────────────────────────

export type ReachAnchor = {
  posture: Posture;
  /** Short town name for {town_paren}, e.g. "Kingwood". */
  town: string;
  /** "Kingwood, TX" for display. */
  townLabel: string;
  lat: number | null;
  lon: number | null;
  /** ZIP the anchor resolved from, if any. */
  zip: string | null;
  /** One-line human explanation of why this posture/market was chosen. */
  reason: string;
  /** The matched market, if the anchor fell inside one. */
  match: MarketMatch | null;
};

type LoadRow = {
  destination: string | null;
  dest_zip: string | null;
  status: string | null;
  created_at: string | null;
};

/**
 * Auto-detect posture from the operator's loads. An active (assigned/loaded)
 * load with a destination → Planning, market = that destination. Otherwise the
 * most recent delivered load's drop → Available. No loads → Available, no
 * anchor (the operator picks a market manually).
 */
export async function detectPosture(
  markets: ReachMarket[],
): Promise<ReachAnchor> {
  let loads: LoadRow[] = [];
  try {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("loads")
      .select("destination, dest_zip, status, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<LoadRow[]>();
    loads = data ?? [];
  } catch {
    loads = [];
  }

  const active = loads.find(
    (l) =>
      (l.status === "loaded" || l.status === "assigned") &&
      (l.dest_zip || l.destination),
  );
  if (active) {
    return anchorFromLoad("planning", active, markets, "Load in transit");
  }

  const delivered = loads.find(
    (l) => l.status === "delivered" && (l.dest_zip || l.destination),
  );
  if (delivered) {
    return anchorFromLoad(
      "available",
      delivered,
      markets,
      "Last load delivered",
    );
  }

  return {
    posture: "available",
    town: "",
    townLabel: "",
    lat: null,
    lon: null,
    zip: null,
    reason: "No active load — pick where you're sitting",
    match: null,
  };
}

function anchorFromLoad(
  posture: Posture,
  load: LoadRow,
  markets: ReachMarket[],
  reason: string,
): ReachAnchor {
  const zip = (load.dest_zip ?? "").trim() || null;
  const hit = zip ? lookupZip(zip) : null;
  const town = hit?.city ?? cityOf(load.destination);
  const state = hit?.state ?? stateOf(load.destination);
  const lat = hit?.lat ?? null;
  const lon = hit?.lon ?? null;
  const match = lat != null && lon != null ? matchMarket(lat, lon, markets) : null;
  return {
    posture,
    town,
    townLabel: [town, state].filter(Boolean).join(", "),
    lat,
    lon,
    zip,
    reason,
    match,
  };
}

/** "Kingwood, TX" → "Kingwood". */
function cityOf(place: string | null): string {
  if (!place) return "";
  return place.split(",")[0]?.trim() ?? "";
}
/** "Kingwood, TX" → "TX". */
function stateOf(place: string | null): string {
  if (!place) return "";
  const parts = place.split(",");
  return parts.length > 1 ? (parts[1]?.trim() ?? "") : "";
}

// ── Recipient auto-build ─────────────────────────────────────────────────────

export type { ReachRecipient, Warmth } from "./types";

export type RecipientBuild = {
  /** Matching brokers not recently reached — pre-selected if they have email. */
  recipients: ReachRecipient[];
  /** Matching brokers reached within the suppression window — greyed out. */
  heldBack: ReachRecipient[];
};

type BrokerRow = { id: string; name: string | null; email: string | null };
type ContactRow = {
  id: string;
  broker_id: string | null;
  email: string | null;
};
type LaneRow = {
  broker_id: string | null;
  origin_zip: string | null;
  origin_state: string | null;
};
type OriginLoadRow = {
  broker_id: string | null;
  origin_zip: string | null;
  origin: string | null;
};
type SendRow = {
  broker_id: string | null;
  email: string | null;
  sent_at: string | null;
};

/**
 * Build the self-assembling recipient list for a market. A broker "touches" the
 * market when a posted lane or booked load originates within the market radius
 * (by ZIP), or — when a lane has no ZIP — shares the market's state. `nowMs` is
 * injected so the same build is deterministic for a given request.
 */
export async function buildRecipients(
  market: ReachMarket,
  opts?: { suppressDays?: number; nowMs?: number },
): Promise<RecipientBuild> {
  const suppressDays = opts?.suppressDays ?? DEFAULT_SUPPRESS_DAYS;
  const nowMs = opts?.nowMs ?? Date.now();
  if (market.centerLat == null || market.centerLon == null) {
    return { recipients: [], heldBack: [] };
  }
  const mState = marketState(market);

  const sb = createServiceRoleClient();
  const cutoffIso = new Date(nowMs - suppressDays * MS_PER_DAY).toISOString();
  const [
    { data: brokerRows },
    { data: contactRows },
    { data: laneRows },
    { data: loadRows },
    { data: sendRows },
  ] = await Promise.all([
    sb
      .from("brokers")
      .select("id, name, email")
      .is("deleted_at", null)
      .returns<BrokerRow[]>(),
    sb
      .from("broker_contacts")
      .select("id, broker_id, email")
      .eq("is_backhaul", true)
      .is("deleted_at", null)
      .returns<ContactRow[]>(),
    sb
      .from("broker_lanes")
      .select("broker_id, origin_zip, origin_state")
      .is("deleted_at", null)
      .returns<LaneRow[]>(),
    sb
      .from("loads")
      .select("broker_id, origin_zip, origin")
      .is("deleted_at", null)
      .returns<OriginLoadRow[]>(),
    sb
      .from("reach_sends")
      .select("broker_id, email, sent_at")
      .gte("sent_at", cutoffIso)
      .returns<SendRow[]>(),
  ]);

  // First backhaul-contact email per broker (fallback when broker.email empty).
  const contactEmail = new Map<string, { email: string; contactId: string }>();
  for (const c of contactRows ?? []) {
    const e = (c.email ?? "").trim();
    if (c.broker_id && e && !contactEmail.has(c.broker_id)) {
      contactEmail.set(c.broker_id, { email: e, contactId: c.id });
    }
  }

  // Count how many lanes/loads tie each broker to this market.
  const matchCount = new Map<string, number>();
  const bump = (bid: string | null) => {
    if (!bid) return;
    matchCount.set(bid, (matchCount.get(bid) ?? 0) + 1);
  };
  const originInMarket = (
    zip: string | null,
    state: string | null,
  ): boolean => {
    const z = (zip ?? "").trim();
    if (/^\d{5}/.test(z)) {
      const hit = lookupZip(z);
      if (hit) {
        return (
          haversineMiles(
            market.centerLat!,
            market.centerLon!,
            hit.lat,
            hit.lon,
          ) <= market.radiusMi
        );
      }
    }
    // No usable ZIP → fall back to state match so state-only lanes still surface.
    if (mState && state && state.trim().toUpperCase() === mState) return true;
    return false;
  };
  for (const l of laneRows ?? []) {
    if (originInMarket(l.origin_zip, l.origin_state)) bump(l.broker_id);
  }
  for (const l of loadRows ?? []) {
    if (originInMarket(l.origin_zip, stateOf(l.origin))) bump(l.broker_id);
  }

  // Most-recent send per broker (by id) and per email, for suppression.
  const lastSendByBroker = new Map<string, number>();
  const lastSendByEmail = new Map<string, number>();
  for (const s of sendRows ?? []) {
    const t = s.sent_at ? Date.parse(s.sent_at) : NaN;
    if (Number.isNaN(t)) continue;
    if (s.broker_id) {
      lastSendByBroker.set(
        s.broker_id,
        Math.max(lastSendByBroker.get(s.broker_id) ?? 0, t),
      );
    }
    const e = (s.email ?? "").trim().toLowerCase();
    if (e) {
      lastSendByEmail.set(e, Math.max(lastSendByEmail.get(e) ?? 0, t));
    }
  }

  const recipients: ReachRecipient[] = [];
  const heldBack: ReachRecipient[] = [];
  for (const b of brokerRows ?? []) {
    const count = matchCount.get(b.id) ?? 0;
    if (count <= 0) continue;
    const fallback = contactEmail.get(b.id);
    const email = (b.email ?? "").trim() || fallback?.email || null;
    const contactId = (b.email ?? "").trim() ? null : fallback?.contactId ?? null;
    const warmth: Warmth = count >= 2 ? "hot" : "warm";

    // Suppression: most recent of the broker-id send and the email send.
    const emailKey = (email ?? "").toLowerCase();
    const lastMs = Math.max(
      lastSendByBroker.get(b.id) ?? 0,
      emailKey ? (lastSendByEmail.get(emailKey) ?? 0) : 0,
    );
    const reachedDaysAgo =
      lastMs > 0 ? Math.floor((nowMs - lastMs) / MS_PER_DAY) : null;

    const rec: ReachRecipient = {
      brokerId: b.id,
      name: b.name?.trim() || "Unnamed broker",
      email,
      contactId,
      matchCount: count,
      warmth,
      reachedDaysAgo,
    };
    if (reachedDaysAgo !== null) heldBack.push(rec);
    else recipients.push(rec);
  }

  const byWarmth = (a: ReachRecipient, b: ReachRecipient) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    if (!!b.email !== !!a.email) return b.email ? 1 : -1;
    return a.name.localeCompare(b.name);
  };
  recipients.sort(byWarmth);
  heldBack.sort((a, b) => (a.reachedDaysAgo ?? 0) - (b.reachedDaysAgo ?? 0));

  return { recipients, heldBack };
}
