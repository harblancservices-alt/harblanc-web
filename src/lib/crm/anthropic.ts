import "server-only";

/**
 * Minimal Anthropic Messages API client — server-only, same shape as
 * lib/fmcsa.ts (key() helper that throws on a missing env var, plain fetch,
 * no SDK dependency). The CRM's only current caller is
 * accounts/[id]/ai-field-mapper.ts, which needs one thing: a JSON object
 * back, reliably. Forcing a single tool call (tool_choice) rather than
 * parsing prose is what makes that reliable — the model can't wrap the
 * answer in commentary or markdown fences.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-5";

function key(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY is not configured.");
  return k;
}

export type JsonSchema = Record<string, unknown>;

/**
 * Ask Claude to fill one tool call matching `schema` and return its `input`.
 * Returns null on any API/parse failure — callers decide how to surface
 * that (this client never throws for a bad response, only for a missing key).
 */
export async function generateStructuredJson({
  system,
  prompt,
  toolName,
  schema,
  maxTokens = 1536,
}: {
  system: string;
  prompt: string;
  toolName: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<Record<string, unknown> | null> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key(),
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
      tools: [{ name: toolName, description: "Record the extracted fields.", input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
    }),
  });

  if (!res.ok) return null;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const content = (json as { content?: unknown })?.content;
  if (!Array.isArray(content)) return null;

  const toolUse = content.find(
    (b): b is { type: "tool_use"; input: Record<string, unknown> } =>
      typeof b === "object" && b !== null && (b as { type?: unknown }).type === "tool_use",
  );
  return toolUse?.input ?? null;
}
