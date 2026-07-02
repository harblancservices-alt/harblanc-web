"use server";

import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { EmailPreset } from "./presets";

/** Where the "Send test to myself" button delivers — Brent's own inbox. */
const TEST_RECIPIENT = "harblancservices@gmail.com";

/**
 * Backhaul — email selected brokers a truck-availability message. Sent from
 * the dispatch address with reply-to the owner inbox so replies land in
 * Gmail. The operator triggers this from the UI after reviewing the message.
 */

export type BackhaulSendResult =
  | { ok: true; sent: number; failed: number }
  | { ok: false; reason: string };

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/** Wrap a plain-text body (newlines → paragraphs) into the backhaul email HTML. */
function renderBackhaulHtml(personalBody: string): string {
  return `<!doctype html><html><body style="margin:0;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111;font-size:15px;line-height:1.6">${personalBody
    .split("\n")
    .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
    .join("")}</body></html>`;
}

export async function sendBackhaul(
  formData: FormData,
): Promise<BackhaulSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const ids = String(formData.get("broker_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (ids.length === 0) return { ok: false, reason: "No brokers selected." };
  if (!subject || !body) return { ok: false, reason: "Subject and message are required." };

  const sb = createServiceRoleClient();
  const [{ data: brokers }, { data: contactRows }] = await Promise.all([
    sb
      .from("brokers")
      .select("id, name, email")
      .in("id", ids)
      .is("deleted_at", null)
      .returns<{ id: string; name: string | null; email: string | null }[]>(),
    // Only backhaul-flagged contacts can be backhaul recipients.
    sb
      .from("broker_contacts")
      .select("broker_id, email")
      .in("broker_id", ids)
      .eq("is_backhaul", true)
      .is("deleted_at", null)
      .returns<{ broker_id: string | null; email: string | null }[]>(),
  ]);

  // Fall back to a dispatcher contact's email when the broker has no main
  // email (dispatcher emails now live on contacts).
  const contactEmail = new Map<string, string>();
  for (const c of contactRows ?? []) {
    const e = (c.email ?? "").trim();
    if (c.broker_id && e && !contactEmail.has(c.broker_id)) {
      contactEmail.set(c.broker_id, e);
    }
  }

  const recipients = (brokers ?? [])
    .map((b) => ({
      ...b,
      email: (b.email ?? "").trim() || contactEmail.get(b.id) || null,
    }))
    .filter((b) => (b.email ?? "").length > 0);
  if (recipients.length === 0) {
    return { ok: false, reason: "None of the selected brokers have an email on file." };
  }

  const from =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  const replyTo = process.env.ADMIN_EMAIL ?? "harblancservices@gmail.com";
  const resend = new Resend(apiKey);

  let sent = 0;
  let failed = 0;
  for (const b of recipients) {
    const personalBody = body.replace(/\{broker\}/g, b.name ?? "there");
    const html = renderBackhaulHtml(personalBody);
    try {
      const res = await resend.emails.send({
        from,
        to: [b.email!.trim()],
        subject,
        text: personalBody,
        html,
        replyTo,
      });
      if (res.error) failed += 1;
      else sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok: true, sent, failed };
}

// ── Email presets ────────────────────────────────────────────────────────────
//
// Editable subject/body templates for the compose box, persisted in the
// email_presets table (see the migration). Single-operator app → one shared
// set, no per-user scoping. All reads/writes go through the service-role client
// (RLS is deny-all to anon/auth).

type PresetRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

const PRESET_COLS = "id, name, subject, body";

function toPreset(r: PresetRow): EmailPreset {
  return { id: r.id, name: r.name, subject: r.subject, body: r.body };
}

export type PresetMutation =
  | { ok: true; preset: EmailPreset }
  | { ok: false; reason: string };

/**
 * Load every non-deleted preset, ordered. `available` is false when the table
 * doesn't exist yet (migration not applied) so the UI can fall back to the
 * in-memory starters and disable saving instead of crashing.
 */
export async function loadEmailPresets(): Promise<{
  presets: EmailPreset[];
  available: boolean;
}> {
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("email_presets")
      .select(PRESET_COLS)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<PresetRow[]>();
    if (error) return { presets: [], available: false };
    return { presets: (data ?? []).map(toPreset), available: true };
  } catch {
    return { presets: [], available: false };
  }
}

export async function createEmailPreset(input: {
  name: string;
  subject: string;
  body: string;
}): Promise<PresetMutation> {
  const name = input.name.trim() || "Untitled preset";
  try {
    const sb = createServiceRoleClient();
    // New presets sort after everything else.
    const { data: last } = await sb
      .from("email_presets")
      .select("sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    const nextSort = (last?.sort_order ?? -1) + 1;
    const { data, error } = await sb
      .from("email_presets")
      .insert({
        name,
        subject: input.subject,
        body: input.body,
        sort_order: nextSort,
      })
      .select(PRESET_COLS)
      .single<PresetRow>();
    if (error || !data) {
      return { ok: false, reason: error?.message ?? "Could not create preset." };
    }
    return { ok: true, preset: toPreset(data) };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Preset storage unavailable.",
    };
  }
}

export async function updateEmailPreset(
  id: string,
  input: { name: string; subject: string; body: string },
): Promise<PresetMutation> {
  if (!id) return { ok: false, reason: "Missing preset id." };
  try {
    const sb = createServiceRoleClient();
    const { data, error } = await sb
      .from("email_presets")
      .update({
        name: input.name.trim() || "Untitled preset",
        subject: input.subject,
        body: input.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select(PRESET_COLS)
      .single<PresetRow>();
    if (error || !data) {
      return { ok: false, reason: error?.message ?? "Could not save preset." };
    }
    return { ok: true, preset: toPreset(data) };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Preset storage unavailable.",
    };
  }
}

export async function deleteEmailPreset(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!id) return { ok: false, reason: "Missing preset id." };
  try {
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from("email_presets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Preset storage unavailable.",
    };
  }
}

// ── Test send ────────────────────────────────────────────────────────────────
//
// Sends the CURRENT compose subject/body to the owner's own inbox so Brent can
// preview exactly what a broker will receive. {broker} renders as "there" (the
// same placeholder the real send uses when a broker has no name). Explicitly
// authorized: it only ever goes to the operator's own address.

export type BackhaulTestResult =
  | { ok: true; to: string }
  | { ok: false; reason: string };

export async function sendBackhaulTest(
  subject: string,
  body: string,
): Promise<BackhaulTestResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY not configured." };

  const subj = subject.trim();
  const bod = body.trim();
  if (!subj || !bod) {
    return { ok: false, reason: "Subject and message are required." };
  }

  const from =
    process.env.RESEND_FROM_ADDRESS ??
    "Harblanc Dispatch <dispatch@harblancservices.com>";
  const replyTo = process.env.ADMIN_EMAIL ?? TEST_RECIPIENT;
  // Always the operator's own inbox — explicitly authorized, never a broker.
  const to = TEST_RECIPIENT;

  const personalBody = bod.replace(/\{broker\}/g, "there");
  const html = renderBackhaulHtml(personalBody);
  const resend = new Resend(apiKey);

  try {
    const res = await resend.emails.send({
      from,
      to: [to],
      subject: `[TEST] ${subj}`,
      text: personalBody,
      html,
      replyTo,
    });
    if (res.error) {
      return { ok: false, reason: res.error.message ?? "Resend rejected the send." };
    }
    return { ok: true, to };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Send failed.",
    };
  }
}
