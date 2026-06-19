import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RateCheckPanel } from "./RateCheckPanel";
import type { CostSettings } from "./types";

/**
 * Rate Check — paste a load-posting screenshot, Claude vision extracts the
 * load, and we tell Brent if it's profitable (take it / pass).
 *
 * The cost basis (cost_per_mile + optional target_margin_pct) lives in
 * public.app_settings (key/value). Read here server-side with the
 * service-role client (bypasses RLS) and handed to the client panel.
 */

export const metadata: Metadata = {
  title: "Rate Check",
  robots: { index: false, follow: false },
};

async function loadCostSettings(): Promise<CostSettings> {
  try {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("app_settings")
      .select("key, value")
      .in("key", ["cost_per_mile", "target_margin_pct"]);

    const map = new Map(
      (data ?? []).map((r: { key: string; value: string | null }) => [
        r.key,
        r.value,
      ]),
    );
    const num = (key: string): number | null => {
      const v = map.get(key);
      if (typeof v !== "string") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      costPerMile: num("cost_per_mile"),
      targetMarginPct: num("target_margin_pct"),
    };
  } catch {
    // app_settings missing or unreachable — panel still works for manual entry.
    return { costPerMile: null, targetMarginPct: null };
  }
}

export default async function RateCheckPage() {
  const cost = await loadCostSettings();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
      <header className="pb-1">
        <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.28em] text-fg">
          Rate Check
        </p>
        <h1 className="mt-1 text-[30px] font-bold leading-none tracking-tight text-fg sm:text-[36px]">
          Take it or pass?
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-fg/70">
          Paste a broker&apos;s load posting and the AI reads the lane, rate,
          and equipment — then checks the rate-per-mile against your cost to
          call it on the spot.
        </p>
      </header>

      <div className="mt-5">
        <RateCheckPanel cost={cost} />
      </div>
    </div>
  );
}
