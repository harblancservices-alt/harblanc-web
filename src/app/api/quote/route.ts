import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendDispatchNotification } from "@/lib/email/dispatch";

export const runtime = "nodejs";

type Body = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  commodity?: unknown;
  weight?: unknown;
  notes?: unknown;
};

const MAX_LEN = {
  name: 200,
  email: 320,
  phone: 50,
  commodity: 400,
  weight: 100,
  notes: 4000,
} as const;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type ValidationResult =
  | {
      ok: true;
      values: {
        name: string;
        email: string;
        phone: string;
        commodity: string;
        weight: string;
        notes: string | null;
      };
    }
  | { ok: false; error: string };

function validate(body: Body): ValidationResult {
  const name = asString(body.name).trim();
  if (name.length < 2) return { ok: false, error: "Name is required." };
  if (name.length > MAX_LEN.name) return { ok: false, error: "Name is too long." };

  const email = asString(body.email).trim();
  if (!email) return { ok: false, error: "Email is required." };
  if (email.length > MAX_LEN.email) return { ok: false, error: "Email is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email is not valid." };
  }

  const phoneRaw = asString(body.phone).trim();
  if (!phoneRaw) return { ok: false, error: "Phone is required." };
  if (phoneRaw.length > MAX_LEN.phone) return { ok: false, error: "Phone is too long." };
  if (phoneRaw.replace(/\D/g, "").length < 10) {
    return { ok: false, error: "Phone number looks too short." };
  }

  const commodity = asString(body.commodity).trim();
  if (commodity.length < 2) return { ok: false, error: "Commodity is required." };
  if (commodity.length > MAX_LEN.commodity) return { ok: false, error: "Commodity is too long." };

  const weight = asString(body.weight).trim();
  if (!weight) return { ok: false, error: "Estimated weight is required." };
  if (weight.length > MAX_LEN.weight) return { ok: false, error: "Weight is too long." };
  if (!/\d/.test(weight)) {
    return { ok: false, error: "Weight must include a number (e.g. 12000 lbs)." };
  }

  const notesRaw = asString(body.notes).trim();
  if (notesRaw.length > MAX_LEN.notes) return { ok: false, error: "Notes are too long." };

  return {
    ok: true,
    values: {
      name,
      email,
      phone: phoneRaw,
      commodity,
      weight,
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
      ...result.values,
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

  // Insert succeeded — fire dispatch email.
  // Failure here must NOT roll back the lead or fail the client response.
  const email = await sendDispatchNotification({
    id: data.id,
    createdAt: data.created_at,
    name: result.values.name,
    email: result.values.email,
    phone: result.values.phone,
    commodity: result.values.commodity,
    weight: result.values.weight,
    notes: result.values.notes,
  });

  if (!email.ok) {
    console.error("[quote] dispatch email failed", {
      leadId: data.id,
      reason: email.reason,
    });
  } else {
    console.log("[quote] dispatch email sent", {
      leadId: data.id,
      emailId: email.emailId,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      leadId: data.id,
      emailDelivered: email.ok,
    },
    { status: 201 },
  );
}
