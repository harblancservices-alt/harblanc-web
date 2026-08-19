"use server";

import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";

export type LogCrmEventInput = {
  kind: "page" | "action";
  label: string;
  path?: string;
};

/**
 * Best-effort activity logging into crm_user_events — powers the "Last
 * active" readout on the owner-only Admin Account section's Accounts detail
 * page (../admin/accounts-data.ts::listTeamMembers) and is otherwise
 * completely invisible: no return value the caller could react to, and every
 * failure is swallowed here so a logging hiccup can never surface an error
 * or block navigation for the person being logged. RLS lets any member
 * insert their OWN event (with_check user_id = auth.uid()), which is exactly
 * what requireCrmUser()'s session-bound client gives us — the login-event
 * insert in crm/login/LoginForm.tsx writes the same table directly from the
 * browser client instead, since that happens before this action's session
 * cookie would even be readable.
 */
export async function logCrmEvent(input: LogCrmEventInput): Promise<void> {
  try {
    const user = await requireCrmUser();
    const supabase = await createCrmServerClient();
    await supabase.from("crm_user_events").insert({
      org_id: user.orgId,
      user_id: user.id,
      kind: input.kind,
      label: input.label,
      path: input.path ?? null,
    });
  } catch {
    // Silent by design — see docstring.
  }
}
