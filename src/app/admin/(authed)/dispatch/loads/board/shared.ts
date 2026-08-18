import type { LoadRow } from "@/lib/dispatch/view-types";

/**
 * Shared derivations and formatting for the Load Board's presentation layer.
 *
 * Everything here is a pure function of a row the SERVER already computed —
 * `net` is the canonical per-load net (loadNet), `rate` already accounts for a
 * cancelled/TONU load earning only its TONU fee. Nothing in this module does money math
 * beyond ratios (margin, revenue-per-mile) drawn from those two figures.
 *
 * THEME SAFETY (the rule the Receivables screen established, f436561): the
 * admin ships a light and a dark theme over the same utility classes, so
 * colored text is only legible on FIXED surfaces — bg-inset, the tinted
 * bg-*-bg pills, bg-graphite. Themed surfaces (bg-card / bg-canvas) carry
 * themed text only (text-fg / text-fg-muted / text-fg-subtle). Every class
 * string handed out below obeys that: the tinted pills pair a fixed tint with
 * its fixed ink, and the solid fills pair a fixed dark with white.
 */

/* ── Formatting ──────────────────────────────────────────────────────────── */

export function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // Sign OUTSIDE the symbol. Concatenating a rounded negative straight onto "$"
  // renders "$-420", which at the card's 18px bold reads as a typo rather than
  // as a loss.
  const v = Math.round(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

/** Compact axis label: 0 → "$0", 2500 → "$2.5k", 10000 → "$10k". */
export function abbrUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (n < 1000) return "$" + Math.round(n);
  const k = n / 1000;
  const s = Number.isInteger(k) ? String(k) : k.toFixed(1);
  return "$" + s + "k";
}

/** Broker initials for the card avatar — at most two letters ("TQL", "CH"). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Margin = the canonical per-load net over the gross rate. Null on a zero rate,
 * where the ratio is undefined rather than 0%. (Unchanged from the previous
 * board — this is the same function, moved.)
 */
export function marginPct(r: LoadRow): number | null {
  return r.rate > 0 ? (r.net / r.rate) * 100 : null;
}

/** Revenue per mile — the load's gross rate over its loaded miles. */
export function ratePerMile(r: LoadRow): number | null {
  return r.loadedMiles != null && r.loadedMiles > 0 ? r.rate / r.loadedMiles : null;
}

/* ── Status ──────────────────────────────────────────────────────────────── */

/**
 * The badge a load wears, derived from status + payment_status together —
 * payment is the later half of a load's life, so a delivered-and-paid load
 * reads "Paid" rather than "Delivered".
 *
 * `payment_status` only ever holds "unpaid" or "paid" in this schema (see the
 * Receivables page), so "Invoiced" is unreachable today; it is kept in the map
 * so an invoiced state can light up its own orange badge the day one exists,
 * rather than silently falling through to the gray default.
 *
 * Every entry is a FIXED tint + FIXED ink (or a solid dark + white), so the
 * badge reads identically on both admin themes.
 */
export type BadgeKey =
  | "pending"
  | "loaded"
  | "transit"
  | "delivered"
  | "invoiced"
  | "paid"
  | "tonu";

export const BADGE: Record<BadgeKey, { label: string; pill: string }> = {
  pending: { label: "Pending", pill: "bg-slate-bg text-slate" },
  loaded: { label: "Loaded", pill: "bg-steel-bg text-steel" },
  transit: { label: "In Transit", pill: "bg-steel-bg text-steel" },
  delivered: { label: "Delivered", pill: "bg-ok-bg text-ok" },
  invoiced: { label: "Invoiced", pill: "bg-warn-bg text-warn" },
  // The one solid fill in the set. Paid is the terminal state and has to
  // out-weigh Delivered's green tint; a second tint would read as a peer.
  paid: { label: "Paid", pill: "bg-graphite text-white" },
  tonu: { label: "TONU", pill: "bg-slate-bg text-slate" },
};

export function badgeOf(r: LoadRow): BadgeKey {
  if (r.status === "tonu") return "tonu";
  if (r.paymentStatus === "paid") return "paid";
  if (r.paymentStatus === "invoiced") return "invoiced";
  if (r.status === "delivered") return "delivered";
  if (r.status === "loaded") return "transit";
  if (r.status === "assigned") return "loaded";
  return "pending";
}

/* ── Shipment timeline ───────────────────────────────────────────────────── */

/**
 * The six stages every load walks, in order. The tracker draws all six on
 * every card; which one is CURRENT comes from `stageOf` below, and everything
 * before it is complete.
 */
export const STAGES = [
  "Pickup",
  "Loaded",
  "Transit",
  "Delivered",
  "Invoice",
  "Paid",
] as const;

/**
 * Index of the load's CURRENT stage (0–5), derived from status + payment
 * status. Stages below it are done, above it are still ahead.
 *
 *   pending           → Pickup    (nothing has happened yet)
 *   assigned          → Loaded    (booked, on its way to the shipper)
 *   loaded            → Transit   (freight is on the truck, rolling)
 *   delivered, unpaid → Invoice   (the haul is done; the money isn't)
 *   paid              → Paid      (terminal — the whole line is complete)
 *
 * A cancelled/TONU load never rolled, so it sits at Pickup and the tracker
 * greys out entirely rather than claiming progress that didn't happen.
 */
export function stageOf(r: LoadRow): number {
  if (r.status === "tonu") return 0;
  if (r.paymentStatus === "paid") return 5;
  if (r.status === "delivered") return 4;
  if (r.status === "loaded") return 2;
  if (r.status === "assigned") return 1;
  return 0;
}
