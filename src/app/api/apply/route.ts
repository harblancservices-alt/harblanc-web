import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sendApplicationNotification } from "@/lib/email/application";

export const runtime = "nodejs";

type Body = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  equipmentType?: unknown;
  cdlStatus?: unknown;
  yearsExperience?: unknown;
  homeBase?: unknown;
  message?: unknown;
  /** Honeypot — a hidden field humans never see/fill; bots fill everything. */
  website?: unknown;
  /** Client timestamp (ms) when the form mounted. Used to reject submits
   *  that come back impossibly fast (a human can't fill this in <2.5s). */
  formStartedAt?: unknown;
};

const MIN_FILL_MS = 2500;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

/** True when this IP has already submitted RATE_MAX+ times in the window. */
async function tooManyFromIp(
  sb: ReturnType<typeof createServiceRoleClient>,
  ip: string | null,
): Promise<boolean> {
  if (!ip) return false;
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await sb
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);
  return (count ?? 0) >= RATE_MAX;
}

const MAX_LEN = {
  name: 200,
  phone: 50,
  email: 320,
  equipmentType: 100,
  cdlStatus: 100,
  yearsExperience: 50,
  homeBase: 100,
  message: 4000,
} as const;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type ValidationResult =
  | {
      ok: true;
      values: {
        name: string;
        phone: string;
        email: string;
        equipmentType: string;
        cdlStatus: string;
        yearsExperience: string | null;
        homeBase: string | null;
        message: string | null;
      };
    }
  | { ok: false; error: string };

function validate(body: Body): ValidationResult {
  const name = asString(body.name).trim();
  if (name.length < 2) return { ok: false, error: "Name is required." };
  if (name.length > MAX_LEN.name) return { ok: false, error: "Name is too long." };

  const phoneRaw = asString(body.phone).trim();
  if (!phoneRaw) return { ok: false, error: "Phone is required." };
  if (phoneRaw.length > MAX_LEN.phone) return { ok: false, error: "Phone is too long." };
  if (phoneRaw.replace(/\D/g, "").length < 10) {
    return { ok: false, error: "Phone number looks too short." };
  }

  const email = asString(body.email).trim();
  if (!email) return { ok: false, error: "Email is required." };
  if (email.length > MAX_LEN.email) return { ok: false, error: "Email is too long." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Email is not valid." };
  }

  const equipmentType = asString(body.equipmentType).trim();
  if (!equipmentType) return { ok: false, error: "Equipment type is required." };
  if (equipmentType.length > MAX_LEN.equipmentType) {
    return { ok: false, error: "Equipment type is too long." };
  }

  const cdlStatus = asString(body.cdlStatus).trim();
  if (!cdlStatus) return { ok: false, error: "CDL status is required." };
  if (cdlStatus.length > MAX_LEN.cdlStatus) {
    return { ok: false, error: "CDL status is too long." };
  }

  const yearsRaw = asString(body.yearsExperience).trim();
  if (yearsRaw.length > MAX_LEN.yearsExperience) {
    return { ok: false, error: "Experience is too long." };
  }

  const homeBaseRaw = asString(body.homeBase).trim();
  if (homeBaseRaw.length > MAX_LEN.homeBase) {
    return { ok: false, error: "Home base is too long." };
  }

  const messageRaw = asString(body.message).trim();
  if (messageRaw.length > MAX_LEN.message) {
    return { ok: false, error: "Message is too long." };
  }

  return {
    ok: true,
    values: {
      name,
      phone: phoneRaw,
      email,
      equipmentType,
      cdlStatus,
      yearsExperience: yearsRaw ? yearsRaw : null,
      homeBase: homeBaseRaw ? homeBaseRaw : null,
      message: messageRaw ? messageRaw : null,
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

  // ── Bot defenses (silent) ──────────────────────────────────────────────
  // Honeypot: the hidden `website` field is invisible to humans. Any value
  // means an automated form-filler. Pretend success so the bot moves on.
  if (asString(body.website).trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  // Too-fast submit: a person cannot complete this form in under 2.5s.
  const startedAt =
    typeof body.formStartedAt === "number" && Number.isFinite(body.formStartedAt)
      ? body.formStartedAt
      : null;
  if (startedAt != null && Date.now() - startedAt < MIN_FILL_MS) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const result = validate(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || null;

  const supabase = createServiceRoleClient();

  // Per-IP rate limit: throttle bursts from a single source.
  if (await tooManyFromIp(supabase, ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 },
    );
  }
  const { data, error } = await supabase
    .from("applications")
    .insert({
      name: result.values.name,
      phone: result.values.phone,
      email: result.values.email,
      equipment_type: result.values.equipmentType,
      cdl_status: result.values.cdlStatus,
      years_experience: result.values.yearsExperience,
      home_base: result.values.homeBase,
      message: result.values.message,
      user_agent: userAgent,
      ip,
    })
    .select("id, created_at")
    .single<InsertedRow>();

  if (error || !data) {
    console.error("[apply] insert failed", {
      code: error?.code,
      message: error?.message,
    });
    return NextResponse.json(
      { error: "Could not save your application. Please try again." },
      { status: 500 },
    );
  }

  const email = await sendApplicationNotification({
    id: data.id,
    createdAt: data.created_at,
    name: result.values.name,
    phone: result.values.phone,
    email: result.values.email,
    equipmentType: result.values.equipmentType,
    cdlStatus: result.values.cdlStatus,
    yearsExperience: result.values.yearsExperience,
    homeBase: result.values.homeBase,
    message: result.values.message,
  });

  if (!email.ok) {
    console.error("[apply] notification email failed", {
      leadId: data.id,
      reason: email.reason,
    });
  } else {
    console.log("[apply] notification email sent", {
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
