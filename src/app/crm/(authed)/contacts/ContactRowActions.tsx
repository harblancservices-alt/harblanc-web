"use client";

import { LogCallDialog } from "../calls/LogCallDialog";
import { BTN_EDIT } from "../_shell/ui";

/**
 * Row-level "Log call" for the global Contacts directory — reuses the same
 * LogCallDialog/logCall flow the company profile uses, wired directly to
 * this row's account_id + contact id (a thin client wrapper because the
 * page above is a Server Component and a render-prop `trigger` function
 * can't cross that boundary — same reasoning as accounts/[id]/LogCallButton.tsx).
 * Only rendered for contacts that have a company: crm_calls is keyed off the
 * account, and a contact quick-added with no company has nowhere for the
 * call to land.
 */
export function ContactRowActions({
  accountId,
  contactId,
  contactName,
}: {
  accountId: string;
  contactId: string;
  contactName: string;
}) {
  return (
    <LogCallDialog
      accountId={accountId}
      contacts={[{ id: contactId, name: contactName }]}
      defaultContactId={contactId}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
        >
          Log call
        </button>
      )}
    />
  );
}
