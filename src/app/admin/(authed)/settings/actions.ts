"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo, DEMO_COOKIE } from "@/lib/admin/demo";

/** Settings actions: fuel defaults (MPG + diesel $/gal) for dispatch math. */

/**
 * DEMO MODE toggle. Sets (or clears) the server-readable `hb-demo` cookie that
 * `isDemoMode()` / `blockedByDemo()` key off. This is the ONE action that is
 * allowed to run in demo mode — it's how you turn demo back OFF — so it must
 * NOT carry the blockedByDemo guard. It never touches Supabase.
 */
export async function setDemoMode(on: boolean): Promise<void> {
  const store = await cookies();
  if (on) {
    store.set(DEMO_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    store.delete(DEMO_COOKIE);
  }
  // Every admin surface reads differently under demo — rebuild the whole portal.
  revalidatePath("/admin", "layout");
}

function numOr(fd: FormData, key: string, fallback: number): number {
  const v = fd.get(key);
  if (typeof v !== "string") return fallback;
  const n = Number(v.replace(/[$,]/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pctOr(fd: FormData, key: string, fallback: number): number {
  const v = fd.get(key);
  if (typeof v !== "string") return fallback;
  const n = Number(v.replace(/[%,]/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function updateFuelSettings(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const sb = createServiceRoleClient();
  const mpg = numOr(formData, "mpg", 13);
  const ppg = numOr(formData, "diesel_price_per_gallon", 4.7);
  const factoringPct = pctOr(formData, "factoring_pct", 3);
  const { error } = await sb
    .from("dispatch_settings")
    .update({
      mpg,
      diesel_price_per_gallon: ppg,
      factoring_pct: factoringPct,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(`Could not save fuel settings: ${error.message}`);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/dispatch/loads");
  revalidatePath("/admin/dispatch/trips");
  // MPG / diesel $ / factoring % feed loadDiesel → loadNet, so every net figure
  // on Performance (and the dashboard's pace) shifts — rebuild both.
  revalidatePath("/admin/performance");
  revalidatePath("/admin");
}

/**
 * Net-profit goal-bar targets: the monthly goal (a specific month view) and the
 * all-months annual goal. Separate action from the fuel form so the two forms
 * never clobber each other's fields on save.
 */
export async function updateProfitGoals(formData: FormData): Promise<void> {
  if (await blockedByDemo()) return; // DEMO: no-op before any DB write.
  const sb = createServiceRoleClient();
  const monthly = numOr(formData, "monthly_net_goal", 10000);
  const annual = numOr(formData, "annual_net_goal", 120000);
  const { error } = await sb
    .from("dispatch_settings")
    .update({
      monthly_net_goal: monthly,
      annual_net_goal: annual,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(`Could not save profit goals: ${error.message}`);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/dispatch/loads");
  // The monthly net goal is the target line on Performance's goal bar and the
  // dashboard's net pace — rebuild both so a new goal shows immediately.
  revalidatePath("/admin/performance");
  revalidatePath("/admin");
}
