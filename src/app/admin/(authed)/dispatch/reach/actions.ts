"use server";

/**
 * Backhaul Reach — CRUD server actions for markets, settings, and templates.
 * Single-operator app → one shared set, no per-user scoping. Everything goes
 * through the service-role client (reach_* RLS is deny-all to anon/auth).
 *
 * Reads live in ./queries.ts; the SEND action lands in Stage 4. Each mutation
 * returns a tagged result the client can surface inline (never throws to the
 * caller for an expected failure).
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { lookupZip } from "@/lib/dispatch/distance";
import { toMarket } from "./queries";
import {
  isLeverage,
  isPosture,
  type Leverage,
  type ReachMarket,
} from "./types";

const REACH_PATH = "/admin/dispatch/reach";

const MARKET_COLS =
  "id, name, wording, center_zip, center_lat, center_lon, radius_mi, towns, notes, sort_order";

type MarketRow = Parameters<typeof toMarket>[0];

export type MarketInput = {
  name: string;
  wording: string;
  centerZip: string;
  radiusMi: number;
};

export type MarketMutation =
  | { ok: true; market: ReachMarket }
  | { ok: false; reason: string };

/**
 * Resolve a center ZIP to lat/long via the bundled zipcodes dataset so distance
 * math has coordinates. A blank/unknown ZIP is allowed (coords null) — the
 * market just won't participate in radius matching until a valid ZIP is set.
 */
function coordsFor(zip: string): {
  centerZip: string | null;
  lat: number | null;
  lon: number | null;
} {
  const z = zip.trim();
  if (!/^\d{5}/.test(z)) return { centerZip: z || null, lat: null, lon: null };
  const hit = lookupZip(z);
  return {
    centerZip: z,
    lat: hit?.lat ?? null,
    lon: hit?.lon ?? null,
  };
}

export async function createReachMarket(
  input: MarketInput,
): Promise<MarketMutation> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "Market name is required." };
  const { centerZip, lat, lon } = coordsFor(input.centerZip);
  try {
    const sb = createServiceRoleClient();
    const { data: last } = await sb
      .from("reach_markets")
      .select("sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    const nextSort = (last?.sort_order ?? -1) + 1;
    const { data, error } = await sb
      .from("reach_markets")
      .insert({
        name,
        wording: input.wording.trim() || name,
        center_zip: centerZip,
        center_lat: lat,
        center_lon: lon,
        radius_mi: clampRadius(input.radiusMi),
        sort_order: nextSort,
      })
      .select(MARKET_COLS)
      .single<MarketRow>();
    if (error || !data) {
      return { ok: false, reason: error?.message ?? "Could not create market." };
    }
    revalidatePath(REACH_PATH);
    return { ok: true, market: toMarket(data) };
  } catch (e) {
    return { ok: false, reason: msg(e, "Market storage unavailable.") };
  }
}

export async function updateReachMarket(
  id: string,
  input: MarketInput,
): Promise<MarketMutation> {
  if (!id) return { ok: false, reason: "Missing market id." };
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "Market name is required." };
  const { centerZip, lat, lon } = coordsFor(input.centerZip);
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("reach_markets")
      .update({
        name,
        wording: input.wording.trim() || name,
        center_zip: centerZip,
        center_lat: lat,
        center_lon: lon,
        radius_mi: clampRadius(input.radiusMi),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select(MARKET_COLS)
      .single<MarketRow>();
    if (error || !data) {
      return { ok: false, reason: error?.message ?? "Could not save market." };
    }
    revalidatePath(REACH_PATH);
    return { ok: true, market: toMarket(data) };
  } catch (e) {
    return { ok: false, reason: msg(e, "Market storage unavailable.") };
  }
}

export async function deleteReachMarket(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!id) return { ok: false, reason: "Missing market id." };
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from("reach_markets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, reason: error.message };
    revalidatePath(REACH_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: msg(e, "Market storage unavailable.") };
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

export type SettingsInput = {
  truckLine: string;
  replyToName: string;
  showExactTown: boolean;
  defaultLeverage: Leverage;
};

export async function updateReachSettings(
  input: SettingsInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const leverage: Leverage = isLeverage(input.defaultLeverage)
    ? input.defaultLeverage
    : "confident";
  try {
    const sb = createServiceRoleClient();
    // Upsert the singleton row (id=true) so it works even if the seed insert
    // never ran.
    const { error } = await sb.from("reach_settings").upsert(
      {
        id: true,
        truck_line: input.truckLine.trim(),
        reply_to_name: input.replyToName.trim() || "HARBLANC",
        show_exact_town: input.showExactTown,
        default_leverage: leverage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return { ok: false, reason: error.message };
    revalidatePath(REACH_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: msg(e, "Settings storage unavailable.") };
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function updateReachTemplate(
  id: string,
  input: { subject: string; body: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!id) return { ok: false, reason: "Missing template id." };
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from("reach_templates")
      .update({
        subject: input.subject,
        body: input.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, reason: error.message };
    revalidatePath(REACH_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: msg(e, "Template storage unavailable.") };
  }
}

/**
 * Ensure a posture×leverage template row exists, returning its id. Used by the
 * template editor when the seed didn't create a given combination (e.g. the
 * migration seeded a subset, or a combo was deleted). Idempotent via the
 * unique(posture, leverage) index.
 */
export async function ensureReachTemplate(
  posture: string,
  leverage: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!isPosture(posture) || !isLeverage(leverage)) {
    return { ok: false, reason: "Invalid posture/leverage." };
  }
  try {
    const sb = createServiceRoleClient();
    const { data: existing } = await sb
      .from("reach_templates")
      .select("id")
      .eq("posture", posture)
      .eq("leverage", leverage)
      .maybeSingle<{ id: string }>();
    if (existing) return { ok: true, id: existing.id };
    const { data, error } = await sb
      .from("reach_templates")
      .insert({ posture, leverage, subject: "", body: "" })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return { ok: false, reason: error?.message ?? "Could not create template." };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, reason: msg(e, "Template storage unavailable.") };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function clampRadius(mi: number): number {
  if (!Number.isFinite(mi)) return 150;
  return Math.min(600, Math.max(10, Math.round(mi)));
}

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
