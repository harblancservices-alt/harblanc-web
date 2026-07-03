"use server";

/**
 * Backhaul Reach — server actions for settings and templates. Markets are
 * BUILT-IN (see ./markets), so there is no market CRUD — Brent never creates or
 * edits markets. Single-operator app → one shared set, no per-user scoping;
 * everything goes through the service-role client (reach_* RLS is deny-all).
 * Each mutation returns a tagged result the client surfaces inline.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isLeverage, isPosture, type Leverage } from "./types";

const REACH_PATH = "/admin/dispatch/reach";

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

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
