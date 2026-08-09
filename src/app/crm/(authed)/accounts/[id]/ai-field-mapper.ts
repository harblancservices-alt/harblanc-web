"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { logActivity, CRM_ACTIVITY } from "@/lib/crm/activity";
import { generateStructuredJson, type JsonSchema } from "@/lib/crm/anthropic";
import { DETAILS_FIELDS, type DetailsFieldDef } from "./details-fields";

/**
 * The AI → field mapper: turns this account's existing AI research notes
 * (is_ai=true crm_notes — see ai-research-actions.ts::requestAiResearch for
 * how those get populated; this app never calls out to do the research
 * itself) into STRUCTURED, per-field suggestions in crm_ai_suggestions.
 *
 * This is deliberately an extraction pass over research that already
 * exists, not a live web-research call — Claude has no browsing tool wired
 * up here, so asking it to "research the company" from just a name would
 * be guessing dressed up as research. Structuring an analyst's/pipeline's
 * free-text findings into fields it can actually ground in something is the
 * honest version of "AI research produces suggestions" this app can offer
 * today (matches AiResearchSection's own "verify before acting" framing).
 *
 * Suggestions are PENDING ONLY — this never writes a crm_accounts column
 * directly. See ai-suggestions-actions.ts for the confirm/edit/dismiss path
 * that does.
 */

export type GenerateResult = { ok: true; count: number } | { ok: false; error: string };

function schemaForField(def: DetailsFieldDef): JsonSchema {
  switch (def.kind) {
    case "number":
    case "rating":
      return { type: "integer", description: def.label };
    case "multiselect":
      return {
        type: "array",
        items: { type: "string" },
        description: `${def.label}. Prefer these when they fit: ${(def.options ?? []).join(", ")}.`,
      };
    case "lanes":
      return {
        type: "array",
        description: def.label,
        items: {
          type: "object",
          properties: { origin: { type: "string" }, destination: { type: "string" } },
          required: ["origin", "destination"],
        },
      };
    default:
      return { type: "string", description: def.label };
  }
}

function buildToolSchema(): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const def of DETAILS_FIELDS) properties[def.key] = schemaForField(def);
  return { type: "object", properties, additionalProperties: false };
}

/** Loose equality for "did the AI actually propose something new" — good
 * enough to skip re-suggesting a value that already matches, without being a
 * strict deep-equal (order-insensitive for arrays). */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const norm = (arr: unknown[]) => arr.map((v) => JSON.stringify(v)).sort();
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  }
  return (a ?? null) === (b ?? null);
}

export async function generateAiSuggestions(accountId: string): Promise<GenerateResult> {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  const columns = Array.from(new Set(["name", ...DETAILS_FIELDS.map((f) => f.column)])).join(", ");
  const { data: accountData } = await supabase
    .from("crm_accounts")
    .select(columns)
    .eq("id", accountId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!accountData) return { ok: false, error: "Company not found." };
  const account = accountData as unknown as Record<string, unknown>;

  const { data: notesData } = await supabase
    .from("crm_notes")
    .select("body, created_at")
    .eq("account_id", accountId)
    .eq("is_ai", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  const notes = (notesData ?? []) as { body: string; created_at: string }[];

  if (notes.length === 0) {
    return {
      ok: false,
      error: "No AI research notes yet — run AI Research first, then generate suggestions from it.",
    };
  }

  const knownFacts = DETAILS_FIELDS.map((f) => `${f.label}: ${JSON.stringify(account[f.column] ?? null)}`).join(
    "\n",
  );
  const researchText = notes.map((n, i) => `[Research note ${i + 1}]\n${n.body}`).join("\n\n");

  const prompt = `Company: ${account.name}

Known Details-record values right now (may already be correct — only propose a
field if the research below gives clear, specific evidence, and only propose a
DIFFERENT value than what's already known if the research contradicts it):
${knownFacts}

Research notes for this company:
${researchText}

Extract only what the research notes actually support. Omit any field the notes
don't clearly speak to — do not guess or infer from the company name alone.`;

  let result: Record<string, unknown> | null;
  try {
    result = await generateStructuredJson({
      system:
        "You extract structured company facts from freight-brokerage sales research notes for a CRM. " +
        "You never fabricate a value — every field you return must be traceable to something stated in " +
        "the research notes provided. Omit fields the notes don't support.",
      prompt,
      toolName: "record_suggestions",
      schema: buildToolSchema(),
    });
  } catch {
    return {
      ok: false,
      error: "AI suggestions aren't available right now — ANTHROPIC_API_KEY isn't configured.",
    };
  }

  if (!result) return { ok: false, error: "Couldn't generate suggestions from the research notes. Try again." };

  const candidates = DETAILS_FIELDS.map((def) => {
    let value = result![def.key];
    if (def.kind === "rating" && typeof value === "number") {
      value = Math.min(5, Math.max(1, Math.round(value)));
    }
    return { def, value };
  }).filter(
    (c) => c.value !== undefined && c.value !== null && !(Array.isArray(c.value) && c.value.length === 0) && c.value !== "",
  );

  const fresh = candidates.filter((c) => !valuesEqual(c.value, account[c.def.column]));
  if (fresh.length === 0) {
    return { ok: false, error: "The research notes don't suggest anything new beyond what's already on file." };
  }

  const fieldKeys = fresh.map((c) => c.def.key);
  await supabase
    .from("crm_ai_suggestions")
    .delete()
    .eq("account_id", accountId)
    .eq("status", "pending")
    .in("field_key", fieldKeys);

  const { error: insertErr } = await supabase.from("crm_ai_suggestions").insert(
    fresh.map((c) => ({
      org_id: user.orgId,
      account_id: accountId,
      field_key: c.def.key,
      suggested_value: c.value,
      status: "pending",
      source: "ai_research",
    })),
  );
  if (insertErr) return { ok: false, error: "Could not save the generated suggestions." };

  await logActivity(supabase, {
    orgId: user.orgId,
    userId: user.id,
    accountId,
    kind: CRM_ACTIVITY.aiSuggestionsGenerated,
    summary: `AI generated ${fresh.length} field suggestion${fresh.length === 1 ? "" : "s"}`,
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  return { ok: true, count: fresh.length };
}
