/**
 * Backhaul Reach — shared types + constants.
 *
 * Server-and-client safe: no DB imports, no "use server". The geo/auto-logic
 * (Stage 2) and UI (Stage 3) both build on these.
 */

/** Auto-detected outreach posture. */
export type Posture = "available" | "planning";

/** Leverage dial — swaps a few phrases; 'confident' is the rate-protecting default. */
export type Leverage = "confident" | "balanced" | "push";

export const POSTURES: readonly Posture[] = ["available", "planning"] as const;
export const LEVERAGES: readonly Leverage[] = [
  "confident",
  "balanced",
  "push",
] as const;

export function isPosture(v: string): v is Posture {
  return v === "available" || v === "planning";
}
export function isLeverage(v: string): v is Leverage {
  return v === "confident" || v === "balanced" || v === "push";
}

export const POSTURE_LABEL: Record<Posture, string> = {
  available: "Available",
  planning: "Planning",
};

export const LEVERAGE_LABEL: Record<Leverage, string> = {
  confident: "Confident",
  balanced: "Balanced",
  push: "Push",
};

/**
 * Operator-facing STYLE names for the leverage presets — the Send-tab segmented
 * toggle. The DB still stores the leverage value; only the label changes, so no
 * data migration is needed. Ordered low → high (see LEVERAGES).
 *   Low-key  ← confident (soft, protects the rate — never "empty")
 *   Standard ← balanced  (the default)
 *   Eager    ← push      (direct, asks their number)
 */
export const STYLE_LABEL: Record<Leverage, string> = {
  confident: "Low-key",
  balanced: "Standard",
  push: "Eager",
};

/** One-line note under the style toggle describing what the wording does. */
export const STYLE_BLURB: Record<Leverage, string> = {
  confident: "Soft ask — protects your rate.",
  balanced: "Invites a rate — the everyday choice.",
  push: "Direct — asks their number.",
};

/** Brand default style (Standard). */
export const DEFAULT_STYLE: Leverage = "balanced";

/** A freight market brokers recognize. Emails name this, not the literal town. */
export type ReachMarket = {
  id: string;
  name: string;
  /** Exact phrase used in the email body (usually equals name). */
  wording: string;
  centerZip: string | null;
  centerLat: number | null;
  centerLon: number | null;
  radiusMi: number;
  /** Free-text towns/notes the market covers. */
  towns: string | null;
  notes: string | null;
  sortOrder: number;
};

/** The singleton Reach settings row. */
export type ReachSettings = {
  /** e.g. "40' gooseneck hotshot, dually". */
  truckLine: string;
  replyToName: string;
  /** Controls the "(39 mi W of Indianapolis, IN)" parenthetical. */
  showExactTown: boolean;
  defaultLeverage: Leverage;
  /** MC number shown in every email signature, e.g. "146-7901". */
  mc: string;
  /** Phone shown in every email signature, e.g. "832-445-8775". */
  phone: string;
};

/** A posture × leverage subject/body template. */
export type ReachTemplate = {
  id: string;
  posture: Posture;
  leverage: Leverage;
  subject: string;
  body: string;
};

/** Broker warmth for a market — how much history ties them to it. */
export type Warmth = "hot" | "warm" | "cold";

/** A self-built recipient row (client-safe; the server build lives in logic.ts). */
export type ReachRecipient = {
  brokerId: string;
  name: string;
  email: string | null;
  /** Contact the fallback email came from (null when it's the broker's own). */
  contactId: string | null;
  /** How many lanes/loads tie this broker to the market. */
  matchCount: number;
  warmth: Warmth;
  /** Set when held back: whole days since we last reached this broker. */
  reachedDaysAgo: number | null;
};

/**
 * Fill the four Reach tokens. {broker} is left for last (filled per-recipient
 * at send), so callers pass it only when rendering a concrete email; the live
 * preview passes a placeholder. Surrounding whitespace is collapsed so an empty
 * {town_paren} (exact-town toggle off) never leaves a double space.
 */
export function renderTemplate(
  text: string,
  ctx: {
    broker?: string;
    market: string;
    equipment: string;
    townParen: string;
    /** Signature MC number, e.g. "146-7901". */
    mc?: string;
    /** Signature phone, e.g. "832-445-8775". */
    phone?: string;
  },
): string {
  const out = text
    .replace(/\{broker\}/g, ctx.broker ?? "{broker}")
    .replace(/\{market\}/g, ctx.market)
    .replace(/\{equipment\}/g, ctx.equipment)
    .replace(/\{town_paren\}/g, ctx.townParen)
    .replace(/\{mc\}/g, ctx.mc ?? "")
    .replace(/\{phone\}/g, ctx.phone ?? "");
  // Collapse runs of spaces/tabs (not newlines), drop a space left before
  // punctuation, and trim trailing space on each line — an empty {town_paren}
  // otherwise leaves "market  with capacity" or "Ready to Roll .".
  return out
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([.,;:!?])/g, "$1")
        .replace(/[ \t]+$/g, ""),
    )
    .join("\n");
}

/**
 * Reverse of renderTemplate for the editable email: turn fully-rendered display
 * text back into a token template so per-broker personalization + auto-fill
 * survive an edit. The operator never sees a raw {token}; we re-insert them on
 * save by matching the concrete values back to their tokens (longest first to
 * avoid a shorter value matching inside a longer one), and the greeting's
 * "there" (how {broker} renders for display) back to {broker} on the first line.
 */
export function templatize(
  text: string,
  ctx: {
    market: string;
    equipment: string;
    townParen: string;
    mc?: string;
    phone?: string;
  },
): string {
  let out = text;
  const subs: [string, string][] = (
    [
      [ctx.townParen, "{town_paren}"],
      [ctx.equipment, "{equipment}"],
      [ctx.market, "{market}"],
      [ctx.mc ?? "", "{mc}"],
      [ctx.phone ?? "", "{phone}"],
    ] as [string, string][]
  )
    .filter(([v]) => v.trim().length >= 2)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [val, tok] of subs) out = out.split(val).join(tok);
  // Greeting name only: the first "there" on the first line becomes {broker}.
  const nl = out.indexOf("\n");
  const head = nl === -1 ? out : out.slice(0, nl);
  const rest = nl === -1 ? "" : out.slice(nl);
  return head.replace(/\bthere\b/i, "{broker}") + rest;
}

export const DEFAULT_SETTINGS: ReachSettings = {
  truckLine: "40' gooseneck hotshot, dually",
  replyToName: "HARBLANC",
  showExactTown: true,
  defaultLeverage: DEFAULT_STYLE,
  mc: "146-7901",
  phone: "832-445-8775",
};
