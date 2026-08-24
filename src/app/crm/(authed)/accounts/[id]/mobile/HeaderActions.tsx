"use client";

import { LogCallDialog } from "../../../calls/LogCallDialog";
import { ContactDialog } from "../ContactDialog";
import { IconPhone, IconPlus } from "../../../_shell/icons";
import { M_BTN, M_BTN_OUTLINE, M_BTN_PRIMARY, M_BTN_SM, M_LINK } from "./ui";

/**
 * The mobile header's "Log call" and "Add person" triggers.
 *
 * These exist ONLY to own the `trigger` closure. LogCallDialog and
 * ContactDialog both take `trigger: (open) => ReactNode`, and a function prop
 * may never cross a Server -> Client boundary — this route has 500'd in
 * production on exactly that three times (see the standing CRM RSC rule). The
 * mobile header itself stays a Server Component; these two thin client
 * wrappers take plain serializable props and build the trigger on the client.
 *
 * Both dialogs are the existing shared ones — same `logCall` / `createContact`
 * server actions, same dedupe and cross-autofill behavior as every other call
 * site. Nothing about the writes is mobile-specific.
 */

export function LogCallButton({ accountId }: { accountId: string }) {
  return (
    <LogCallDialog
      accountId={accountId}
      trigger={(open) => (
        <button type="button" onClick={open} className={`${M_BTN} ${M_BTN_PRIMARY}`}>
          <IconPhone width={15} height={15} />
          <span className="truncate">Log call</span>
        </button>
      )}
    />
  );
}

export function AddPersonButton({ accountId }: { accountId: string }) {
  return (
    <ContactDialog
      accountId={accountId}
      mode="create"
      trigger={(open) => (
        <button type="button" onClick={open} className={`${M_BTN} ${M_BTN_OUTLINE}`}>
          <IconPlus width={15} height={15} />
          <span className="truncate">Add person</span>
        </button>
      )}
    />
  );
}

/** The People section's own "+ Add person" text trigger — same dialog, lighter
 * affordance, so the section header matches every other section's action. */
export function AddPersonLink({ accountId }: { accountId: string }) {
  return (
    <ContactDialog
      accountId={accountId}
      mode="create"
      trigger={(open) => (
        <button type="button" onClick={open} className={M_LINK}>
          + Add person
        </button>
      )}
    />
  );
}

/** Per-contact "Log call" shortcut used by the People list, pre-pointed at
 * that person so the dialog opens with the contact already resolved. */
export function ContactLogCallButton({
  accountId,
  contactId,
  phone,
  label = "Log",
}: {
  accountId: string;
  contactId: string;
  phone: string | null;
  label?: string;
}) {
  return (
    <LogCallDialog
      accountId={accountId}
      contactId={contactId}
      phone={phone}
      trigger={(open) => (
        <button type="button" onClick={open} className={`${M_BTN_SM} border-line-strong bg-card text-fg hover:bg-inset`}>
          {label}
        </button>
      )}
    />
  );
}
