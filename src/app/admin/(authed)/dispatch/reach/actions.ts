"use server";

/**
 * Backhaul Reach — server actions for settings and templates. Markets are
 * BUILT-IN (see @/lib/domain/reach/markets), so there is no market CRUD —
 * Brent never creates or edits markets. Single-operator app → one shared
 * set, no per-user scoping; everything goes through the service-role client
 * (reach_* RLS is deny-all).
 *
 * The settings/template mutations are shared with /tms-v2 via
 * @/lib/domain/reach/settings (see that file's header) — this file only
 * adds what's specific to /admin: the demo-mode gate and revalidating
 * /admin's own paths. resolveLocation and setContactInclude are NOT part of
 * that extraction and stay here unchanged; /tms-v2 doesn't call them.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { blockedByDemo } from "@/lib/admin/demo";
import { lookupCoords } from "@/lib/dispatch/distance";
import {
  updateReachSettings as updateReachSettingsShared,
  updateReachTemplate as updateReachTemplateShared,
  ensureReachTemplate as ensureReachTemplateShared,
  saveReachStyleEmail as saveReachStyleEmailShared,
  type SettingsInput,
} from "@/lib/domain/reach/settings";

const REACH_PATH = "/admin/dispatch/reach";

// ── Geolocation ──────────────────────────────────────────────────────────────

export type ResolvedLocation = {
  zip: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
};

/**
 * Reverse-geocode a browser lat/lon to the nearest town/ZIP (the bundled
 * zipcodes dataset lives server-side, so this runs here). Backs the "Use my
 * location" button — the client hands back the resolved ZIP the same way a
 * typed-and-picked town would.
 */
export async function resolveLocation(
  lat: number,
  lon: number,
): Promise<ResolvedLocation | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const hit = lookupCoords(lat, lon);
    if (!hit) return null;
    return {
      zip: hit.zip,
      city: hit.city,
      state: hit.state,
      lat: hit.lat,
      lon: hit.lon,
    };
  } catch {
    return null;
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function updateReachSettings(
  input: SettingsInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (await blockedByDemo()) return { ok: true }; // DEMO: no-op, benign success.
  const result = await updateReachSettingsShared(input);
  if (result.ok) revalidatePath(REACH_PATH);
  return result;
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function updateReachTemplate(
  id: string,
  input: { subject: string; body: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (await blockedByDemo()) return { ok: true }; // DEMO: no-op, benign success.
  const result = await updateReachTemplateShared(id, input);
  if (result.ok) revalidatePath(REACH_PATH);
  return result;
}

export async function ensureReachTemplate(
  posture: string,
  leverage: string,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (await blockedByDemo()) {
    return { ok: false, reason: "Demo mode — changes aren't saved." };
  }
  return ensureReachTemplateShared(posture, leverage);
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
  if (await blockedByDemo()) return { ok: true }; // DEMO: no-op, benign success.
  const result = await saveReachStyleEmailShared(posture, leverage, input);
  if (result.ok) revalidatePath(REACH_PATH);
  return result;
}

// ── Contacts (Include toggle) ────────────────────────────────────────────────

/**
 * Flip a contact's Include switch (broker_contacts.is_backhaul) — whether it's
 * used for backhaul reach. Toggled from the Contacts tab.
 */
export async function setContactInclude(
  contactId: string,
  include: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (await blockedByDemo()) return { ok: true }; // DEMO: no-op, benign success.
  if (!contactId) return { ok: false, reason: "Missing contact id." };
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from("broker_contacts")
      .update({ is_backhaul: include })
      .eq("id", contactId);
    if (error) return { ok: false, reason: error.message };
    revalidatePath(REACH_PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: msg(e, "Contact storage unavailable.") };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
