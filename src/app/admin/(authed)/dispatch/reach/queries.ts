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
import { builtInMarkets } from "./markets";
import {
  DEFAULT_SETTINGS,
  isLeverage,
  isPosture,
  type Leverage,
  type ReachMarket,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

/**
 * Markets are BUILT-IN (see ./markets) — Brent never creates or edits them.
 * `available` stays true so the page always renders the auto-mapped experience.
 * Kept async so callers (server component) don't need to change shape.
 */
export async function loadReachMarkets(): Promise<{
  markets: ReachMarket[];
  available: boolean;
}> {
  return { markets: builtInMarkets(), available: true };
}

type SettingsRow = {
  truck_line: string | null;
  reply_to_name: string | null;
  show_exact_town: boolean | null;
  default_leverage: string | null;
  mc: string | null;
  phone: string | null;
};

export async function loadReachSettings(): Promise<ReachSettings> {
  try {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("reach_settings")
      .select("truck_line, reply_to_name, show_exact_town, default_leverage")
      .eq("id", true)
      .maybeSingle<Omit<SettingsRow, "mc" | "phone">>();
    if (!data) return DEFAULT_SETTINGS;
    const lev: Leverage = isLeverage(data.default_leverage ?? "")
      ? (data.default_leverage as Leverage)
      : DEFAULT_SETTINGS.defaultLeverage;
    // MC / phone / reply-to live in columns added by later migrations; read
    // them best-effort so the page still works (with defaults) before those
    // land. Reply-to is its own query so it survives even if mc/phone are absent.
    let mc = DEFAULT_SETTINGS.mc;
    let phone = DEFAULT_SETTINGS.phone;
    try {
      const { data: sig } = await sb
        .from("reach_settings")
        .select("mc, phone")
        .eq("id", true)
        .maybeSingle<{ mc: string | null; phone: string | null }>();
      if (sig) {
        mc = (sig.mc ?? "").trim() || DEFAULT_SETTINGS.mc;
        phone = (sig.phone ?? "").trim() || DEFAULT_SETTINGS.phone;
      }
    } catch {
      // columns not present yet — keep the defaults
    }
    let replyToEmail = DEFAULT_SETTINGS.replyToEmail;
    try {
      const { data: r } = await sb
        .from("reach_settings")
        .select("reply_to_email")
        .eq("id", true)
        .maybeSingle<{ reply_to_email: string | null }>();
      if (r) {
        replyToEmail = (r.reply_to_email ?? "").trim() || DEFAULT_SETTINGS.replyToEmail;
      }
    } catch {
      // column not present yet — keep the default
    }
    return {
      truckLine: (data.truck_line ?? "").trim() || DEFAULT_SETTINGS.truckLine,
      replyToName:
        (data.reply_to_name ?? "").trim() || DEFAULT_SETTINGS.replyToName,
      showExactTown: data.show_exact_town ?? true,
      defaultLeverage: lev,
      mc,
      phone,
      replyToEmail,
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

// ── Contacts (the Contacts tab) ──────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One broker contact for the Contacts tab. Include = broker_contacts.is_backhaul. */
export type ReachContact = {
  contactId: string;
  /** Contact person's name. */
  name: string;
  /** Broker/company the contact belongs to. */
  company: string;
  /** "City, ST" derived from a broker lane origin — "" when unknown. */
  area: string;
  email: string | null;
  /** Whether this contact is included in the reach recipient pool. */
  include: boolean;
  /** Whole days since this contact/broker was last reached; null if never. */
  lastReachedDaysAgo: number | null;
};

type ContactListRow = {
  id: string;
  broker_id: string | null;
  name: string | null;
  email: string | null;
  is_backhaul: boolean | null;
};
type BrokerNameRow = { id: string; name: string | null };
type LaneAreaRow = {
  broker_id: string | null;
  origin_city: string | null;
  origin_state: string | null;
};
type SendStampRow = {
  broker_id: string | null;
  email: string | null;
  sent_at: string | null;
};

/**
 * Every broker contact ever entered, joined with its company, a representative
 * area (from the broker's lanes), and when it was last reached. Resilient to the
 * reach_sends table not existing yet. Sorted A→Z by contact name.
 */
export async function loadReachContacts(): Promise<{
  contacts: ReachContact[];
  available: boolean;
}> {
  try {
    const sb = createServiceRoleClient();
    const nowMs = Date.now();
    const [
      { data: contactRows, error: cErr },
      { data: brokerRows },
      { data: laneRows },
      { data: sendRows },
    ] = await Promise.all([
      sb
        .from("broker_contacts")
        .select("id, broker_id, name, email, is_backhaul")
        .is("deleted_at", null)
        .returns<ContactListRow[]>(),
      sb
        .from("brokers")
        .select("id, name")
        .is("deleted_at", null)
        .returns<BrokerNameRow[]>(),
      sb
        .from("broker_lanes")
        .select("broker_id, origin_city, origin_state")
        .is("deleted_at", null)
        .returns<LaneAreaRow[]>(),
      sb
        .from("reach_sends")
        .select("broker_id, email, sent_at")
        .returns<SendStampRow[]>(),
    ]);
    if (cErr) return { contacts: [], available: false };

    const brokerName = new Map<string, string>();
    for (const b of brokerRows ?? []) {
      brokerName.set(b.id, (b.name ?? "").trim() || "Unnamed broker");
    }

    // First lane with an origin per broker → "City, ST" area.
    const area = new Map<string, string>();
    for (const l of laneRows ?? []) {
      if (!l.broker_id || area.has(l.broker_id)) continue;
      const city = (l.origin_city ?? "").trim();
      const state = (l.origin_state ?? "").trim().toUpperCase();
      const label = [city, state].filter(Boolean).join(", ");
      if (label) area.set(l.broker_id, label);
    }

    // Most-recent send per broker and per email, for "last reached".
    const lastByBroker = new Map<string, number>();
    const lastByEmail = new Map<string, number>();
    for (const s of sendRows ?? []) {
      const t = s.sent_at ? Date.parse(s.sent_at) : NaN;
      if (Number.isNaN(t)) continue;
      if (s.broker_id) {
        lastByBroker.set(s.broker_id, Math.max(lastByBroker.get(s.broker_id) ?? 0, t));
      }
      const e = (s.email ?? "").trim().toLowerCase();
      if (e) lastByEmail.set(e, Math.max(lastByEmail.get(e) ?? 0, t));
    }

    const contacts: ReachContact[] = (contactRows ?? []).map((c) => {
      const email = (c.email ?? "").trim() || null;
      const emailKey = email?.toLowerCase() ?? "";
      const lastMs = Math.max(
        c.broker_id ? (lastByBroker.get(c.broker_id) ?? 0) : 0,
        emailKey ? (lastByEmail.get(emailKey) ?? 0) : 0,
      );
      return {
        contactId: c.id,
        name: (c.name ?? "").trim() || "Unnamed contact",
        company: c.broker_id ? (brokerName.get(c.broker_id) ?? "—") : "—",
        area: (c.broker_id ? area.get(c.broker_id) : "") ?? "",
        email,
        include: !!c.is_backhaul,
        lastReachedDaysAgo:
          lastMs > 0 ? Math.floor((nowMs - lastMs) / MS_PER_DAY) : null,
      };
    });
    contacts.sort((a, b) => a.name.localeCompare(b.name));
    return { contacts, available: true };
  } catch {
    return { contacts: [], available: false };
  }
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
