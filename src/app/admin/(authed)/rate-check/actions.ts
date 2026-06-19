"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { estimateLaneMiles } from "@/lib/dispatch/distance";
import type { AnalyzeResult, ExtractedLoad } from "./types";

/**
 * Rate Check server actions.
 *
 *   analyzeRateScreenshot — sends a (downscaled, client-side) load-posting
 *     image to Claude vision via the Anthropic Messages API and returns
 *     structured load data. Degrades gracefully when ANTHROPIC_API_KEY is
 *     unset so the panel builds and works today, then "comes alive" once
 *     Brent adds the key.
 *
 *   estimateMilesForZips — recomputes driving miles from an origin/dest ZIP
 *     pair (client calls this when Brent edits the ZIPs in the form).
 *
 *   saveCostSettings — persists cost_per_mile (and optional target_margin_pct)
 *     to public.app_settings so the profitability verdict can run.
 *
 * The image goes THROUGH this action to Anthropic — it is never written to
 * Supabase storage. Screenshots are ephemeral and downscaled small.
 */

// Current vision-capable model. Opus 4.8 supports high-resolution images
// and strict JSON output via output_config.format.
const VISION_MODEL = "claude-opus-4-8";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

const EXTRACTION_PROMPT = `You are reading a screenshot of a freight load posting — it could be from a load board, a broker's email, or a text message. Extract the load details into the provided JSON schema.

Rules:
- Use null for any field that is not clearly visible. Do NOT guess or invent values.
- Money fields (rate_total, rate_per_mile) must be plain numbers with no "$" or commas (e.g. 2500, not "$2,500").
- If the posting says "call for rate", "CFR", "negotiable", or shows no rate at all, set rate_total and rate_per_mile to null.
- origin_zip / dest_zip: only a 5-digit US ZIP code if one is clearly shown; otherwise null. Do not infer a ZIP from a city name.
- trip_miles: only if a mileage/distance is actually shown in the posting; otherwise null.
- origin / destination: the city and state as written (e.g. "Houston, TX").
- Dates: copy as shown (e.g. "6/19", "Mon 6/20", "ASAP").
- equipment: trailer type (e.g. "Flatbed", "Reefer", "Dry Van", "Step Deck").
- broker: the posting company / broker name. contact: phone or email if shown.
- notes: anything else relevant (commodity, dims, special instructions).`;

// Strict JSON schema for the extraction. All keys are required and nullable
// so the model must emit every field (using null when absent) — this is what
// makes downstream parsing total. additionalProperties:false is required by
// the structured-outputs validator.
const LOAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    origin: { type: ["string", "null"] },
    destination: { type: ["string", "null"] },
    origin_zip: { type: ["string", "null"] },
    dest_zip: { type: ["string", "null"] },
    trip_miles: { type: ["number", "null"] },
    rate_total: { type: ["number", "null"] },
    rate_per_mile: { type: ["number", "null"] },
    equipment: { type: ["string", "null"] },
    weight: { type: ["string", "null"] },
    broker: { type: ["string", "null"] },
    contact: { type: ["string", "null"] },
    pickup_date: { type: ["string", "null"] },
    delivery_date: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
  },
  required: [
    "origin",
    "destination",
    "origin_zip",
    "dest_zip",
    "trip_miles",
    "rate_total",
    "rate_per_mile",
    "equipment",
    "weight",
    "broker",
    "contact",
    "pickup_date",
    "delivery_date",
    "notes",
  ],
} as const;

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** Coerce a value to a finite number, else null (handles "$2,500", "2.10/mi"). */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && n !== 0 ? n : null;
  }
  return null;
}

/** Coerce to a trimmed non-empty string, else null. */
function toStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.toLowerCase() !== "null" ? t : null;
}

/** Defensive normalizer — turns whatever the model returned into ExtractedLoad. */
function normalizeLoad(raw: Record<string, unknown>): ExtractedLoad {
  const zip = (v: unknown): string | null => {
    const s = toStr(v);
    if (!s) return null;
    const m = s.match(/\b\d{5}\b/);
    return m ? m[0] : null;
  };
  return {
    origin: toStr(raw.origin),
    destination: toStr(raw.destination),
    origin_zip: zip(raw.origin_zip),
    dest_zip: zip(raw.dest_zip),
    trip_miles: toNum(raw.trip_miles),
    rate_total: toNum(raw.rate_total),
    rate_per_mile: toNum(raw.rate_per_mile),
    equipment: toStr(raw.equipment),
    weight: toStr(raw.weight),
    broker: toStr(raw.broker),
    contact: toStr(raw.contact),
    pickup_date: toStr(raw.pickup_date),
    delivery_date: toStr(raw.delivery_date),
    notes: toStr(raw.notes),
  };
}

/** Pull the first JSON object out of the model's text (handles code fences). */
function parseModelJson(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    // Fall back to grabbing the outermost {...} block.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
}

export async function analyzeRateScreenshot(input: {
  /** Base64-encoded image data (no data: URL prefix). */
  base64: string;
  /** MIME type of the (downscaled) image, e.g. "image/jpeg". */
  mediaType: string;
}): Promise<AnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      reason:
        "Vision not configured — add your ANTHROPIC_API_KEY in the environment to enable screenshot reading.",
    };
  }

  const mediaType = ALLOWED_MEDIA.has(input.mediaType)
    ? input.mediaType
    : "image/jpeg";

  if (!input.base64 || input.base64.length < 100) {
    return { ok: false, configured: true, reason: "No image data received." };
  }

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 1024,
        output_config: { format: { type: "json_schema", schema: LOAD_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: input.base64,
                },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    return {
      ok: false,
      configured: true,
      reason: "Couldn't reach the vision service. Check your connection and try again.",
    };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err?.error?.message ? ` (${err.error.message})` : "";
    } catch {
      /* ignore */
    }
    const friendly =
      res.status === 401
        ? "The ANTHROPIC_API_KEY was rejected. Double-check the key."
        : res.status === 429
          ? "Vision service is rate-limited right now — wait a moment and retry."
          : `Vision service returned an error (${res.status}).`;
    return { ok: false, configured: true, reason: friendly + detail };
  }

  let payload: { content?: Array<{ type?: string; text?: string }> };
  try {
    payload = await res.json();
  } catch {
    return { ok: false, configured: true, reason: "Vision service returned an unreadable response." };
  }

  const text =
    payload.content?.find((b) => b.type === "text" && typeof b.text === "string")
      ?.text ?? "";
  const raw = parseModelJson(text);
  if (!raw) {
    return {
      ok: false,
      configured: true,
      reason: "Couldn't read the load details from that image. Try a clearer screenshot.",
    };
  }

  const load = normalizeLoad(raw);

  // If the posting didn't show miles but gave us both ZIPs, compute them.
  let computedMiles: number | null = load.trip_miles;
  let milesWereComputed = false;
  if (computedMiles == null && load.origin_zip && load.dest_zip) {
    const est = estimateLaneMiles(load.origin_zip, load.dest_zip);
    if (est.ok) {
      computedMiles = est.miles;
      milesWereComputed = true;
    }
  }

  return { ok: true, load, computedMiles, milesWereComputed };
}

/**
 * Recompute driving miles from a ZIP pair. Called from the client when Brent
 * edits the origin/dest ZIP fields so the verdict can re-run without another
 * vision call. Keeps the heavy `zipcodes` dataset server-side.
 */
export async function estimateMilesForZips(
  originZip: string,
  destZip: string,
): Promise<{ miles: number | null; reason: string | null }> {
  const o = originZip.trim();
  const d = destZip.trim();
  if (!/^\d{5}/.test(o) || !/^\d{5}/.test(d)) {
    return { miles: null, reason: "Enter both 5-digit ZIPs to compute miles." };
  }
  const est = estimateLaneMiles(o, d);
  if (!est.ok) return { miles: null, reason: est.reason };
  return { miles: est.miles, reason: null };
}

/**
 * Persist the cost basis used by the verdict. cost_per_mile is required;
 * target_margin_pct is optional. Stored as text values in public.app_settings
 * (key/value) via the service-role client, which bypasses RLS.
 */
export async function saveCostSettings(formData: FormData): Promise<void> {
  const cpmRaw = formData.get("cost_per_mile");
  const marginRaw = formData.get("target_margin_pct");

  const cpm =
    typeof cpmRaw === "string"
      ? Number(cpmRaw.replace(/[^0-9.\-]/g, ""))
      : NaN;
  if (!Number.isFinite(cpm) || cpm <= 0) {
    throw new Error("Cost per mile must be a positive number.");
  }

  const rows: { key: string; value: string; updated_at: string }[] = [
    { key: "cost_per_mile", value: String(cpm), updated_at: new Date().toISOString() },
  ];

  if (typeof marginRaw === "string" && marginRaw.trim() !== "") {
    const margin = Number(marginRaw.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(margin) && margin >= 0) {
      rows.push({
        key: "target_margin_pct",
        value: String(margin),
        updated_at: new Date().toISOString(),
      });
    }
  }

  const sb = createServiceRoleClient();
  const { error } = await sb
    .from("app_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`Could not save cost settings: ${error.message}`);

  revalidatePath("/admin/rate-check");
}
