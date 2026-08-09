import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../_shell/ui";
import { fetchPendingSuggestions } from "./ai-suggestions";
import { DETAILS_FIELDS, DETAILS_GROUP_LABEL, type DetailsFieldGroup } from "./details-fields";
import { SuggestionRow } from "./SuggestionRow";
import { GenerateSuggestionsButton } from "./GenerateSuggestionsButton";

/**
 * The Details tab's AI-suggestion review surface — every pending
 * crm_ai_suggestions row for this account, grouped the same way the Details
 * sections are, each with Confirm / Edit / Dismiss (see SuggestionRow.tsx).
 * Any sales rep can act on any suggestion — no role gate. Sits at the top of
 * the Details tab (rather than scattered inline banners per field) so one
 * place answers "what has AI proposed for this company right now" — see
 * ai-field-mapper.ts for how a suggestion gets created.
 */
export async function AiSuggestionsPanel({ accountId }: { accountId: string }) {
  const [suggestions, currentValues] = await Promise.all([
    fetchPendingSuggestions(accountId),
    (async () => {
      const supabase = await createCrmServerClient();
      const columns = Array.from(new Set(DETAILS_FIELDS.map((f) => f.column))).join(", ");
      const { data } = await supabase.from("crm_accounts").select(columns).eq("id", accountId).maybeSingle();
      return (data as unknown as Record<string, unknown>) ?? {};
    })(),
  ]);

  const byGroup = new Map<DetailsFieldGroup, typeof suggestions>();
  for (const s of suggestions) {
    const def = DETAILS_FIELDS.find((f) => f.key === s.fieldKey);
    if (!def) continue;
    const list = byGroup.get(def.group) ?? [];
    list.push(s);
    byGroup.set(def.group, list);
  }

  return (
    <Card>
      <CardHead
        title="AI suggestions"
        hint={
          suggestions.length
            ? `${suggestions.length} pending — generated from AI Research notes, verify before confirming`
            : "Generated from AI Research notes — none pending right now"
        }
        right={<GenerateSuggestionsButton accountId={accountId} />}
      />
      {suggestions.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-fg-muted">
          No pending suggestions. Run AI Research on the AI Research tab, then generate suggestions here to map
          it onto Details fields.
        </p>
      ) : (
        <div className="divide-y divide-line-strong">
          {Array.from(byGroup.entries()).map(([group, rows]) => (
            <div key={group}>
              <p className="bg-inset px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                {DETAILS_GROUP_LABEL[group]}
              </p>
              <ul className="divide-y divide-line-strong">
                {rows.map((s) => {
                  const def = DETAILS_FIELDS.find((f) => f.key === s.fieldKey)!;
                  return <SuggestionRow key={s.id} suggestion={s} currentValue={currentValues[def.column]} />;
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
