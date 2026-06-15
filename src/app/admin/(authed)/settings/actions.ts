"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Settings actions: fuel defaults (MPG + diesel $/gal) for dispatch math. */

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
}
