/**
 * Backhaul Reach — server-side READ helpers (no "use server"; these are plain
 * async functions a server component calls directly). Mutations live in
 * ./actions.ts. All reads go through the service-role client (RLS is deny-all).
 *
 * Every loader is resilient to the reach_* tables not existing yet (migration
 * applied separately): it returns sensible defaults + `available: false` so the
 * page renders instead of crashing before the migration lands.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  DEFAULT_SETTINGS,
  isLeverage,
  isPosture,
  type Leverage,
  type ReachMarket,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

type MarketRow = {
  id: string;
  name: string | null;
  wording: string | null;
  center_zip: string | null;
  center_lat: number | null;
  center_lon: number | null;
  radius_mi: number | null;
  towns: string | null;
  notes: string | null;
  sort_order: number | null;
};

const MARKET_COLS =
  "id, name, wording, center_zip, center_lat, center_lon, radius_mi, towns, notes, sort_order";

export function toMarket(r: MarketRow): ReachMarket {
  return {
    id: r.id,
    name: r.name ?? "",
    wording: (r.wording ?? "").trim() || (r.name ?? ""),
    centerZip: r.center_zip,
    centerLat: r.center_lat,
    centerLon: r.center_lon,
    radiusMi: r.radius_mi ?? 150,
    towns: r.towns,
    notes: r.notes,
    sortOrder: r.sort_order ?? 0,
  };
}

export async function loadReachMarkets(): Promise<{
  markets: ReachMarket[];
  available: boolean;
}> {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("reach_markets")
      .select(MARKET_COLS)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<MarketRow[]>();
    if (error) return { markets: [], available: false };
    return { markets: (data ?? []).map(toMarket), available: true };
  } catch {
    return { markets: [], available: false };
  }
}

type SettingsRow = {
  truck_line: string | null;
  reply_to_name: string | null;
  show_exact_town: boolean | null;
  default_leverage: string | null;
};

export async function loadReachSettings(): Promise<ReachSettings> {
  try {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("reach_settings")
      .select("truck_line, reply_to_name, show_exact_town, default_leverage")
      .eq("id", true)
      .maybeSingle<SettingsRow>();
    if (!data) return DEFAULT_SETTINGS;
    const lev: Leverage = isLeverage(data.default_leverage ?? "")
      ? (data.default_leverage as Leverage)
      : DEFAULT_SETTINGS.defaultLeverage;
    return {
      truckLine: (data.truck_line ?? "").trim() || DEFAULT_SETTINGS.truckLine,
      replyToName:
        (data.reply_to_name ?? "").trim() || DEFAULT_SETTINGS.replyToName,
      showExactTown: data.show_exact_town ?? true,
      defaultLeverage: lev,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type TemplateRow = {
  id: string;
  posture: string | null;
  leverage: string | null;
  subject: string | null;
  body: string | null;
};

const TEMPLATE_COLS = "id, posture, leverage, subject, body";

export function toTemplate(r: TemplateRow): ReachTemplate | null {
  if (!isPosture(r.posture ?? "") || !isLeverage(r.leverage ?? "")) return null;
  return {
    id: r.id,
    posture: r.posture as ReachTemplate["posture"],
    leverage: r.leverage as ReachTemplate["leverage"],
    subject: r.subject ?? "",
    body: r.body ?? "",
  };
}

export async function loadReachTemplates(): Promise<{
  templates: ReachTemplate[];
  available: boolean;
}> {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("reach_templates")
      .select(TEMPLATE_COLS)
      .order("posture", { ascending: true })
      .order("leverage", { ascending: true })
      .returns<TemplateRow[]>();
    if (error) return { templates: [], available: false };
    const templates = (data ?? [])
      .map(toTemplate)
      .filter((t): t is ReachTemplate => t !== null);
    return { templates, available: true };
  } catch {
    return { templates: [], available: false };
  }
}
