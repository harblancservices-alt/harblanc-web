import { createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../_shell/ui";
import { ContextNotesDialog } from "./ContextNotesDialog";

/**
 * Details tab — "Context" group. One free-text field, distinct from the
 * History tab's notes/calls/activity stream — this is a standing "worth
 * knowing" field on the record itself, not a dated log entry.
 */
export async function ContextNotesSection({ accountId }: { accountId: string }) {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_accounts")
    .select("context_notes")
    .eq("id", accountId)
    .maybeSingle();

  const notes = (data?.context_notes as string | null) ?? null;

  return (
    <Card>
      <CardHead
        title="Notes"
        right={
          <ContextNotesDialog accountId={accountId} defaultValue={notes} />
        }
      />
      <div className="p-5">
        {notes ? (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{notes}</p>
        ) : (
          <p className="text-[13.5px] text-fg-subtle">No notes yet.</p>
        )}
      </div>
    </Card>
  );
}
