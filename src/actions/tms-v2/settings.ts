"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { mutation, type MutationResult } from "@/lib/demo/mutation";
import { DEMO_COOKIE } from "@/lib/admin/demo";
import { adminFromMiddleware } from "@/lib/auth/session";

/**
 * dispatch_settings writes — same mutation() pattern as
 * src/actions/tms-v2/loads.ts. Field set mirrors V1's
 * src/app/admin/(authed)/settings/actions.ts exactly (same singleton row,
 * `id = true`), reimplemented (not imported) since V1's versions throw.
 * These values feed nearly every net-profit calc in the app (money.ts's
 * FuelSettings + the goal-bar figures), so every input is validated before
 * it ever reaches the row — no defaulting-to-a-fallback-and-saving-anyway.
 */

function revalidateSettingsPaths() {
  revalidatePath("/tms-v2/settings");
  revalidatePath("/tms-v2/loads");
  revalidatePath("/tms-v2/trips");
  revalidatePath("/tms-v2/performance");
  revalidatePath("/tms-v2/receivables");
  revalidatePath("/tms-v2/brokers");
  revalidatePath("/tms-v2");
}

function num(fd: FormData, key: string): number | null {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export const updateFuelSettings = mutation(async (formData: FormData): Promise<MutationResult> => {
  const mpg = num(formData, "mpg");
  const ppg = num(formData, "diesel_price_per_gallon");
  const factoringPct = num(formData, "factoring_pct");

  if (mpg == null || mpg <= 0) return { ok: false, reason: "Enter a valid MPG (greater than 0)." };
  if (ppg == null || ppg <= 0) return { ok: false, reason: "Enter a valid diesel price per gallon (greater than 0)." };
  if (factoringPct == null || factoringPct < 0 || factoringPct > 100) {
    return { ok: false, reason: "Factoring % must be between 0 and 100." };
  }

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("dispatch_settings")
    .update({ mpg, diesel_price_per_gallon: ppg, factoring_pct: factoringPct, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, reason: `Could not save fuel settings: ${error.message}` };

  revalidateSettingsPaths();
  return { ok: true };
});

/** Owner-entered cash on hand — same dispatch_settings singleton, its own
 * action so saving it never clobbers the fuel or goal fields (matching
 * legacy's separate updateCurrentCash in countdown-actions.ts, ported here
 * rather than reused since legacy's version throws instead of returning a
 * MutationResult). */
export const updateCurrentCash = mutation(async (formData: FormData): Promise<MutationResult> => {
  const cash = num(formData, "current_cash");
  if (cash == null || cash < 0) return { ok: false, reason: "Enter a valid amount." };

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("dispatch_settings")
    .update({ current_cash: cash, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, reason: `Could not save current cash: ${error.message}` };

  revalidateSettingsPaths();
  return { ok: true };
});

export const updateProfitGoals = mutation(async (formData: FormData): Promise<MutationResult> => {
  const monthly = num(formData, "monthly_net_goal");
  const annual = num(formData, "annual_net_goal");

  if (monthly == null || monthly < 0) return { ok: false, reason: "Enter a valid monthly net goal." };
  if (annual == null || annual < 0) return { ok: false, reason: "Enter a valid annual net goal." };

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("dispatch_settings")
    .update({ monthly_net_goal: monthly, annual_net_goal: annual, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { ok: false, reason: `Could not save profit goals: ${error.message}` };

  revalidateSettingsPaths();
  return { ok: true };
});

/** Toggle demo mode — deliberately NOT wrapped in mutation(), which blocks
 * every write while demo is on; this is the one write that must still work
 * in that state, or demo could never be turned back off (same reasoning
 * legacy's own setDemoMode carries). Still auth-gated (adminFromMiddleware),
 * just not demo-gated. Same cookie legacy uses (src/lib/admin/demo.ts's
 * DEMO_COOKIE) — /admin and /tms-v2 share one demo session, not two. */
export async function setDemoMode(on: boolean): Promise<void> {
  await adminFromMiddleware();
  const store = await cookies();
  if (on) {
    store.set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  } else {
    store.delete(DEMO_COOKIE);
  }
  // Every /tms-v2 and /admin surface reads differently under demo — rebuild both.
  revalidatePath("/tms-v2", "layout");
  revalidatePath("/admin", "layout");
}
