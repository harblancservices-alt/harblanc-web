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
  /** Controls the "(Kingwood, 22 mi NE)" parenthetical. */
  showExactTown: boolean;
  defaultLeverage: Leverage;
};

/** A posture × leverage subject/body template. */
export type ReachTemplate = {
  id: string;
  posture: Posture;
  leverage: Leverage;
  subject: string;
  body: string;
};

/**
 * Fill the four Reach tokens. {broker} is left for last (filled per-recipient
 * at send), so callers pass it only when rendering a concrete email; the live
 * preview passes a placeholder. Surrounding whitespace is collapsed so an empty
 * {town_paren} (exact-town toggle off) never leaves a double space.
 */
export function renderTemplate(
  text: string,
  ctx: { broker?: string; market: string; equipment: string; townParen: string },
): string {
  const out = text
    .replace(/\{broker\}/g, ctx.broker ?? "{broker}")
    .replace(/\{market\}/g, ctx.market)
    .replace(/\{equipment\}/g, ctx.equipment)
    .replace(/\{town_paren\}/g, ctx.townParen);
  // Collapse runs of spaces/tabs (not newlines) and trim trailing space on each
  // line — an empty {town_paren} otherwise leaves "market  with capacity".
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, ""))
    .join("\n");
}

export const DEFAULT_SETTINGS: ReachSettings = {
  truckLine: "40' gooseneck hotshot, dually",
  replyToName: "HARBLANC",
  showExactTown: true,
  defaultLeverage: "confident",
};
