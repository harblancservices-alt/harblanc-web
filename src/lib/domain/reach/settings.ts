import { createServiceRoleClient } from "@/lib/supabase/server";
import { isLeverage, isPosture, type Leverage } from "./types";

/**
 * Backhaul Reach — settings/template mutations, shared by both /admin and
 * /tms-v2, each of which adds only its own app-specific behavior on top
 * (demo-mode gate and revalidatePath targets for /admin; revalidatePath
 * targets for /tms-v2, which has no demo mode) — see the two wrapper
 * files: src/app/admin/(authed)/dispatch/reach/actions.ts and
 * src/actions/tms-v2/reach.ts. Markets are BUILT-IN (see ./markets), so
 * there is no market CRUD here. Single-operator app → one shared settings
 * row, no per-user scoping; everything goes through the service-role
 * client (reach_* RLS is deny-all).
 *
 * resolveLocation and setContactInclude are NOT part of this extraction —
 * they stay in admin's actions.ts unchanged; /tms-v2 doesn't call them
 * (tms-v2's Contacts management reuses its own broker-contact actions,
 * src/actions/tms-v2/brokers.ts, instead).
 */

export type SettingsInput = {
  truckLine: string;
  replyToName: string;
  showExactTown: boolean;
  defaultLeverage: Leverage;
  /** Reply-to inbox for every send. */
  replyToEmail: string;
  /** Optional legacy signature tokens — only written when provided. */
  mc?: string;
  phone?: string;
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
    // reply_to_email (and the legacy mc/phone) live in columns added by later
    // migrations; write them best-effort so saving the rest still works before
    // those land. Each in its own statement so a missing column can't block the
    // others.
    try {
      await sb
        .from("reach_settings")
        .update({ reply_to_email: input.replyToEmail.trim() })
        .eq("id", true);
    } catch {
      // column not present yet — the other settings still saved
    }
    if (input.mc !== undefined || input.phone !== undefined) {
      try {
        await sb
          .from("reach_settings")
          .update({ mc: (input.mc ?? "").trim(), phone: (input.phone ?? "").trim() })
          .eq("id", true);
      } catch {
        // columns not present yet
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: msg(e, "Settings storage unavailable.") };
  }
}

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

/**
 * Save the (possibly edited) Send-tab email as the default for a style. The Send
 * tab shows one email per posture×style; editing + saving persists it here so it
 * auto-fills next time. Ensures the row exists first (idempotent), then updates.
 */
export async function saveReachStyleEmail(
  posture: string,
  leverage: string,
  input: { subject: string; body: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ens = await ensureReachTemplate(posture, leverage);
  if (!ens.ok) return { ok: false, reason: ens.reason };
  return updateReachTemplate(ens.id, input);
}

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
