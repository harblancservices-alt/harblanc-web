/**
 * The one place /tms-v2 reads `dispatch_settings` (mpg/diesel price/
 * factoring %). /admin copy-pastes this fetch per page (v2-architecture.md
 * research); /tms-v2 fixes that here — every money-computing query in
 * lib/data/* calls this once via the DataSource, not per call site.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import { isDemoMode } from "@/lib/admin/demo";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { DEMO_SETTINGS_ROW } from "@/lib/demo/demoData";
import type { FuelSettings } from "@/lib/domain/money";

export async function getFuelSettings(): Promise<FuelSettings> {
  const ds = await resolveDataSource();
  return ds.getFuelSettings();
}

// ---------------------------------------------------------------------------
// Settings page (v2-design.md §27) — the full `dispatch_settings` singleton,
// not just the money-engine's FuelSettings subset. Read-only for this
// phase (the write forms are a later, deferred phase per the phase brief),
// so this stays a single settings-specific query function rather than a
// DataSource method, following the same single-file-scope precedent
// `lib/data/loads.ts`'s `getLoadDetail()` sets for fields the shared
// DataSource interface doesn't expose yet.
// ---------------------------------------------------------------------------

export type DispatchSettingsSummary = {
  mpg: number;
  dieselPricePerGallon: number;
  factoringPct: number;
  monthlyNetGoal: number;
  annualNetGoal: number;
  currentCash: number;
};

function num(v: number | string | null | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** In demo mode this deliberately returns the fake `DEMO_SETTINGS_ROW`
 * values, never the real DB row — matching /admin's Settings page (audit
 * §24) so the config panel agrees with the demo money math shown
 * everywhere else, and never leaks a real number while presenting. */
export async function getDispatchSettingsSummary(): Promise<DispatchSettingsSummary> {
  if (await isDemoMode()) {
    return {
      mpg: DEMO_SETTINGS_ROW.mpg,
      dieselPricePerGallon: DEMO_SETTINGS_ROW.diesel_price_per_gallon,
      factoringPct: DEMO_SETTINGS_ROW.factoring_pct,
      monthlyNetGoal: DEMO_SETTINGS_ROW.monthly_net_goal,
      annualNetGoal: DEMO_SETTINGS_ROW.annual_net_goal,
      currentCash: DEMO_SETTINGS_ROW.current_cash,
    };
  }

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("dispatch_settings")
    .select("mpg, diesel_price_per_gallon, factoring_pct, monthly_net_goal, annual_net_goal, current_cash")
    .eq("id", true)
    .maybeSingle<{
      mpg: number | string | null;
      diesel_price_per_gallon: number | string | null;
      factoring_pct: number | string | null;
      monthly_net_goal: number | string | null;
      annual_net_goal: number | string | null;
      current_cash: number | string | null;
    }>();

  return {
    mpg: num(data?.mpg, 13),
    dieselPricePerGallon: num(data?.diesel_price_per_gallon, 4.7),
    factoringPct: num(data?.factoring_pct, 3),
    monthlyNetGoal: num(data?.monthly_net_goal, 10000),
    annualNetGoal: num(data?.annual_net_goal, 120000),
    currentCash: num(data?.current_cash, 0),
  };
}
