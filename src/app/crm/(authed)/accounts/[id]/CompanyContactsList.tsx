"use client";

import { BTN_NEUTRAL, BTN_RED, Card, CardHead, ZEBRA_ROWS } from "../../_shell/ui";
import { IconContacts, IconPhone, IconMail, IconPlus } from "../../_shell/icons";
import { ClickableListItem } from "../../_shell/ClickableRow";
import { digitsForTel, type PhoneEntry, type LinkEntry } from "../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ContactDialog, type ContactDefaults } from "./ContactDialog";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { LogCallDialog } from "../../calls/LogCallDialog";
import type { TaskContactOption } from "../../tasks/TaskDialog";

export type CrmContact = ContactDefaults & {
  id: string;
  name: string;
  phones: PhoneEntry[];
  links: LinkEntry[];
};

const ROW_BTN =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors";

/**
 * CONTACTS — the rebuilt inline roster of everyone at this company: name,
 * title, direct phone (tel:), email (mailto:), tap-to-call, plus a compact
 * per-row action bar (Log call / Note / Edit) so activity can still get
 * logged from right here. Deliberately lean vs. the old PersonCard/
 * ContactRow split it replaces — no role pill, no primary-contact toggle
 * (that management didn't make this pass; see the surface-1 completion
 * report). A client component so the dialogs' render-prop triggers can cross
 * cleanly (this whole list is already client, unlike a Server Component
 * parent — see crm-rsc-trigger-boundary-rule).
 */
export function CompanyContactsList({
  accountId,
  contacts,
  contactOptions,
}: {
  accountId: string;
  contacts: CrmContact[];
  contactOptions: TaskContactOption[];
}) {
  return (
    <Card>
      <CardHead
        title="Contacts"
        hint={contacts.length ? `${contacts.length} on file` : undefined}
        right={
          <ContactDialog
            accountId={accountId}
            mode="create"
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_RED}`}
              >
                <IconPlus width={14} height={14} />
                Add contact
              </button>
            )}
          />
        }
      />

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center bg-inset text-fg-subtle">
            <IconContacts />
          </span>
          <p className="text-[14px] font-semibold text-fg">No contacts yet</p>
          <p className="max-w-xs text-[13px] text-fg-muted">Add one to start tracking who you talk to here.</p>
        </div>
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {contacts.map((c) => {
            const primaryPhone = c.phones[0] ?? null;
            return (
              <ClickableListItem
                key={c.id}
                href={`/crm/contacts/${c.id}`}
                className="flex flex-col gap-2.5 px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[14.5px] font-semibold text-fg">{c.name}</span>
                  {c.title && <span className="text-[12.5px] text-fg-muted">{c.title}</span>}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                  {primaryPhone ? (
                    <a
                      href={`tel:${digitsForTel(primaryPhone.number)}`}
                      className="font-mono text-accent hover:underline"
                    >
                      {primaryPhone.label ? `${primaryPhone.label}: ` : ""}
                      {formatPhone(primaryPhone.number)}
                    </a>
                  ) : (
                    <span className="text-fg-subtle">No phone on file</span>
                  )}
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="text-accent hover:underline">
                      {c.email}
                    </a>
                  ) : (
                    <span className="text-fg-subtle">No email on file</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {primaryPhone && (
                    <a href={`tel:${digitsForTel(primaryPhone.number)}`} className={`${ROW_BTN} ${BTN_RED}`}>
                      <IconPhone width={13} height={13} />
                      Call
                    </a>
                  )}
                  <LogCallDialog
                    accountId={accountId}
                    contacts={contactOptions}
                    defaultContactId={c.id}
                    trigger={(open) => (
                      <button type="button" onClick={open} className={`${ROW_BTN} ${BTN_RED}`}>
                        Log call
                      </button>
                    )}
                  />
                  <QuickNoteDialog
                    accountId={accountId}
                    contactId={c.id}
                    contactName={c.name}
                    trigger={(open) => (
                      <button type="button" onClick={open} className={`${ROW_BTN} ${BTN_RED}`}>
                        Note
                      </button>
                    )}
                  />
                  {c.email && (
                    <a href={`mailto:${c.email}`} className={`${ROW_BTN} ${BTN_RED}`}>
                      <IconMail width={13} height={13} />
                      Email
                    </a>
                  )}
                  <ContactDialog
                    accountId={accountId}
                    mode="edit"
                    defaults={c}
                    trigger={(open) => (
                      <button type="button" onClick={open} className={`${ROW_BTN} ${BTN_NEUTRAL}`}>
                        Edit
                      </button>
                    )}
                  />
                </div>
              </ClickableListItem>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
