"use client";

import { LogCallDialog } from "../calls/LogCallDialog";
import { QuickNoteDialog } from "../accounts/[id]/QuickNoteDialog";
import { BTN_ACTION } from "../_shell/ui";
import { IconNote } from "../_shell/icons";

/**
 * Row-level actions for the global Contacts directory — "Log call" reuses
 * the same LogCallDialog/logCall flow the company profile uses, wired
 * directly to this row's account_id + contact id (a thin client wrapper
 * because the page above is a Server Component and a render-prop `trigger`
 * function can't cross that boundary — same reasoning as
 * accounts/[id]/LogCallButton.tsx). It's only rendered for contacts that
 * have a company: crm_calls is keyed off the account, and a contact
 * quick-added with no company has nowhere for the call to land. "Add note"
 * has no such requirement — it reuses the same QuickNoteDialog the company
 * profile's Contacts card uses, tying the note to this contact via
 * contact_id (account_id may be null).
 */
export function ContactRowActions({
  accountId,
  contactId,
  contactName,
}: {
  accountId: string | null;
  contactId: string;
  contactName: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {accountId && (
        <LogCallDialog
          accountId={accountId}
          contacts={[{ id: contactId, name: contactName }]}
          defaultContactId={contactId}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_ACTION}`}
            >
              Log call
            </button>
          )}
        />
      )}
      <QuickNoteDialog
        accountId={accountId}
        contactId={contactId}
        contactName={contactName}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_ACTION}`}
          >
            <IconNote width={12} height={12} />
            Add note
          </button>
        )}
      />
    </div>
  );
}
