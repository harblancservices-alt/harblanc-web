import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendDispatchNotification } from "@/lib/email/dispatch";
import { sendCustomerAcknowledgement } from "@/lib/email/acknowledgement";
import { logDispatchEvent } from "@/lib/dispatch/events";

export const runtime = "nodejs";

/**
 * POST /api/quote — public Quick Quote endpoint.
 *
 * Reads the Quick Quote payload (lane ZIPs, load, pickup date, contact,
 * optional notes), inserts a row into quote_requests, and fires two
 * follow-on emails:
 *
 *   1. Internal dispatch notification (existing). Subject framed as
 *      "NEW QUOTE — {origin ZIP} → {dest ZIP} — {weight}" so Brent's
 *      phone preview shows the lane at a glance.
 *
 *   2. Customer acknowledgement (new in Phase 2B). Plain, human-feeling,
 *      signed by Brent. Locks the lead.
 *
 * Both email sends fail gracefully — if Resend isn't configured or
 * delivery fails, the lead is still saved and the client still sees
 * success. We log the failure reason so Brent / monitoring can catch it.
 */

type Body = {
  pickupZip?: unknown;
  deliveryZip?: unknown;
  commodity?: unknown;
  weight?: unknown;
  pickupDate?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
  /** Honeypot field — must be empty / absent for a real submission. */
  website?: unknown;
  /** Client timestamp when the form mounted (Date.now()). Must be >= 2s ago. */
  formStartedAt?: unknown;
};

/** Minimum time between form-mount and submit. Anything faster is a bot. */
const MIN_SUBMIT_MS = 2000;

const MAX_LEN = {
  pickupZip: 10,
  deliveryZip: 10,
  commodity: 400,
  weight: 100,
  pickupDate: 32,
  name: 200,
  phone: 50,
  email: 320,
  notes: 4000,
} as const;

const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
// Strict ISO date in YYYY-MM-DD form — matches what <input type="date"> emits.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type ValidatedValues = {
  pickupZip: string;
  deliveryZip: string;
  commodity: string;
  weight: string;
  pickupDate: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string | null;
};

type ValidationResult =
  | { ok: true; values: ValidatedValues }
  | { ok: false; error: string };

function validate(body: Body): ValidationResult {
  const pickupZip = asString(body.pickupZip).trim();
  if (!pickupZip) return { ok: false, error: "Pickup ZIP is required." };
  if (pickupZip.length > MAX_LEN.pickupZip) {
    return { ok: false, error: "Pickup ZIP is too long." };
  }
  if (!ZIP_RE.test(pickupZip)) {
    return { ok: false, error: "Pickup ZIP must be a 5-digit ZIP." };
  }

  const deliveryZip = asString(body.deliveryZip).trim();
  if (!deliveryZip) return { ok: false, error: "Delivery ZIP is required." };
  if (deliveryZip.length > MAX_LEN.deliveryZip) {
    return { ok: false, error: "Delivery ZIP is too long." };
  }
  if (!ZIP_RE.test(deliveryZip)) {
    return { ok: false, error: "Delivery ZIP must be a 5-digit ZIP." };
  }

  const commodity = asString(body.commodity).trim();
  if (commodity.length < 2) {
    return { ok: false, error: "Commodity is required." };
  }
  if (commodity.length > MAX_LEN.commodity) {
    return { ok: false, error: "Commodity is too long." };
  }

  const weight = asString(body.weight).trim();
  if (!weight) return { ok: false, error: "Approximate weight is required." };
  if (weight.length > MAX_LEN.weight) {
    return { ok: false, error: "Weight is too long." };
  }
  if (!/\d/.test(weight)) {
    return { ok: false, error: "Weight must include a number." };
  }

  // pickupDate is optional. If present, must be ISO date.
  const pickupDateRaw = asString(body.pickupDate).trim();
  let pickupDate: string | null = null;
  if (pickupDateRaw) {
    if (pickupDateRaw.length > MAX_LEN.pickupDate) {
      return { ok: false, error: "Pickup date is too long." };
    }
    if (!ISO_DATE_RE.test(pickupDateRaw)) {
      return {
        ok: false,
        error: "Pickup date must be in YYYY-MM-DD format.",
      };
    }
    pickupDate = pickupDateRaw;
  }

  const name = asString(body.name).trim();
  if (name.length < 2) return { ok: false, error: "Name is required." };
  if (name.length > MAX_LEN.name) return { ok: false, error: "Name is too long." };

  const phoneRaw = asString(body.phone).trim();
  if (!phoneRaw) return { ok: false, error: "Phone is required." };
  if (phoneRaw.length > MAX_LEN.phone) {
    return { ok: false, error: "Phone is too long." };
  }
  if (phoneRaw.replace(/\D/g, "").length < 10) {
    return { ok: false, error: "Phone number looks too short." };
  }

  const email = asString(body.email).trim();
  if (!email) return { ok: false, error: "Email is required." };
  if (email.length > MAX_LEN.email) {
    return { ok: false, error: "Email is too long." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email is not valid." };
  }

  const notesRaw = asString(body.notes).trim();
  if (notesRaw.length > MAX_LEN.notes) {
    return { ok: false, error: "Notes are too long." };
  }

  return {
    ok: true,
    values: {
      pickupZip,
      deliveryZip,
      commodity,
      weight,
      pickupDate,
      name,
      phone: phoneRaw,
      email,
      notes: notesRaw ? notesRaw : null,
    },
  };
}

type InsertedRow = {
  id: string;
  created_at: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // ── Anti-spam: honeypot + minimum submit time ──────────────────────
  //
  // Both checks return a generic 400 — we deliberately don't reveal
  // which check failed so bots can't differentiate. Real users never
  // see either error because honest form fills always satisfy both.
  const honeypot =
    typeof body.website === "string" ? body.website.trim() : "";
  if (honeypot.length > 0) {
    console.warn("[quote] honeypot tripped", { ua: req.headers.get("user-agent") });
    return NextResponse.json(
      { error: "Could not save your request. Please try again." },
      { status: 400 },
    );
  }

  const formStartedAt =
    typeof body.formStartedAt === "number" ? body.formStartedAt : 0;
  const elapsed = Date.now() - formStartedAt;
  if (formStartedAt > 0 && elapsed < MIN_SUBMIT_MS) {
    console.warn("[quote] submit too fast", {
      elapsedMs: elapsed,
      ua: req.headers.get("user-agent"),
    });
    return NextResponse.json(
      { error: "Could not save your request. Please try again." },
      { status: 400 },
    );
  }

  const result = validate(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("quote_requests")
    .insert({
      name: result.values.name,
      email: result.values.email,
      phone: result.values.phone,
      commodity: result.values.commodity,
      weight: result.values.weight,
      notes: result.values.notes,
      pickup_zip: result.values.pickupZip,
      delivery_zip: result.values.deliveryZip,
      pickup_date: result.values.pickupDate,
      user_agent: userAgent,
      ip,
    })
    .select("id, created_at")
    .single<InsertedRow>();

  if (error || !data) {
    console.error("[quote] insert failed", {
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json(
      { error: "Could not save your request. Please try again." },
      { status: 500 },
    );
  }

  // Log lead received to the timeline.
  await logDispatchEvent(supabase, data.id, "lead_received", {
    source: "quick_quote_form",
  });

  // Insert succeeded — fire both emails in parallel.
  // Neither failure rolls back the lead or fails the client response.
  const [dispatchEmail, ackEmail] = await Promise.all([
    sendDispatchNotification({
      id: data.id,
      createdAt: data.created_at,
      name: result.values.name,
      email: result.values.email,
      phone: result.values.phone,
      commodity: result.values.commodity,
      weight: result.values.weight,
      pickupZip: result.values.pickupZip,
      deliveryZip: result.values.deliveryZip,
      pickupDate: result.values.pickupDate,
      notes: result.values.notes,
    }),
    sendCustomerAcknowledgement({
      to: result.values.email,
      name: result.values.name,
      pickupZip: result.values.pickupZip,
      deliveryZip: result.values.deliveryZip,
      commodity: result.values.commodity,
      weight: result.values.weight,
      pickupDate: result.values.pickupDate,
      leadId: data.id,
    }),
  ]);

  if (!dispatchEmail.ok) {
    console.error("[quote] dispatch email failed", {
      leadId: data.id,
      reason: dispatchEmail.reason,
    });
    await logDispatchEvent(supabase, data.id, "dispatch_alert_failed", {
      reason: dispatchEmail.reason,
    });
  } else {
    console.log("[quote] dispatch email sent", {
      leadId: data.id,
      emailId: dispatchEmail.emailId,
    });
    await logDispatchEvent(supabase, data.id, "dispatch_alert_sent", {
      emailId: dispatchEmail.emailId,
    });
  }

  if (!ackEmail.ok) {
    console.error("[quote] acknowledgement email failed", {
      leadId: data.id,
      reason: ackEmail.reason,
    });
    await logDispatchEvent(supabase, data.id, "ack_failed", {
      reason: ackEmail.reason,
      to: result.values.email,
    });
  } else {
    console.log("[quote] acknowledgement email sent", {
      leadId: data.id,
      emailId: ackEmail.emailId,
    });
    await logDispatchEvent(supabase, data.id, "ack_sent", {
      emailId: ackEmail.emailId,
      to: result.values.email,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      leadId: data.id,
      dispatchEmailDelivered: dispatchEmail.ok,
      acknowledgementEmailDelivered: ackEmail.ok,
    },
    { status: 201 },
  );
}
