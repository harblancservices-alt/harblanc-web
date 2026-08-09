"use client";

import { BTN_NEUTRAL, BTN_RED } from "../../_shell/ui";
import { ClickableListItem } from "../../_shell/ClickableRow";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { lastContactStatus, timestampMs } from "../../_shell/format";
import { formatPhone } from "@/lib/domain/phone";
import { RoleControl } from "./RoleControl";
import { ContactDialog, type ContactDefaults } from "./ContactDialog";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import type { RepOption } from "../CompanyDialog";

export type CrmContact = ContactDefaults & {
  id: string;
  name: string;
  phones: PhoneEntry[];
  links: LinkEntry[];
  last_contacted_at?: string | null;
};

const GRID_BTN =
  "inline-flex items-center justify-center rounded-lg px-1.5 py-1.5 text-center text-[10.5px] font-semibold leading-tight transition-colors";

/**
 * The Overview tab's "People at this company" card — the square 3-across
 * grid, DELIBERATELY DIFFERENT from the Contacts tab's full-width rows (see
 * ContactRow.tsx) which is the full-CRUD directory (primary-contact toggle,
 * Delete). This card stays display + quick-action only: avatar + name on
 * top, the inline role-pill selector (RoleControl — sets role_category
 * immediately, no Edit dialog involved) below that, then labeled phone/
 * email/last-contacted on the left BESIDE a compact 2×2 grid of red
 * (dc2626) operational actions (Log call / Add task / Note / Email) on the
 * right. The card carries `@container` and switches to that side-by-side
 * layout at `@[340px]` — a CONTAINER query on the card's own rendered
 * width, not the viewport, since the grid it sits in (see
 * PeopleSection.tsx) is itself responsive (auto-fill, min 340px per card).
 * Below that width the two stack (info above, buttons below, full width)
 * instead of cramming. Clicking the card (anywhere that isn't one of its
 * own buttons/links) opens the contact's own profile page — see
 * contacts/[contactId]/page.tsx — via ClickableListItem, which already
 * ignores clicks on nested interactive elements.
 */
export function PersonCard({
  accountId,
  person,
  reps,
  contactOptions,
  canAssignOthers,
  currentUser,
}: {
  accountId: string;
  person: CrmContact;
  reps: RepOption[];
  contactOptions: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  const primaryPhone = person.phones[0] ?? null;
  const lastContacted = lastContactStatus(timestampMs(person.last_contacted_at)).text;

  return (
    <ClickableListItem
      href={`/crm/contacts/${person.id}`}
      className="@container flex flex-col gap-3 border border-line-strong bg-card p-4 shadow-e1 hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-graphite text-[15px] font-semibold text-white">
            {person.name.charAt(0).toUpperCase() || "?"}
          </span>
          <p className="truncate text-[14.5px] font-semibold text-fg">{person.name}</p>
        </div>
        <ContactDialog
          accountId={accountId}
          mode="edit"
          defaults={person}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              aria-label={`Edit ${person.name}`}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Edit
            </button>
          )}
        />
      </div>

      {person.title && <p className="text-[12.5px] text-fg-muted">{person.title}</p>}

      <RoleControl
        contactId={person.id}
        accountId={accountId}
        current={person.role_category ?? null}
      />

      {/* Info on the left, the 2x2 red action grid on the right — stacks
          (info above, buttons below, full-width) below the `@[340px]`
          container width so it never gets cramped. */}
      <div className="flex flex-col gap-3 @[340px]:flex-row @[340px]:items-start @[340px]:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12.5px]">
          {primaryPhone ? (
            <span className="font-mono text-fg-muted">
              {primaryPhone.label ? `${primaryPhone.label}: ` : ""}
              {formatPhone(primaryPhone.number)}
            </span>
          ) : (
            <span className="text-fg-subtle">No phone on file</span>
          )}
          {person.email ? (
            <a href={`mailto:${person.email}`} className="truncate text-accent hover:underline">
              {person.email}
            </a>
          ) : (
            <span className="text-fg-subtle">No email on file</span>
          )}
          <span className="text-fg-subtle">Last contacted: {lastContacted}</span>
        </div>

        <div className="grid w-full grid-cols-2 gap-1.5 @[340px]:w-40 @[340px]:shrink-0">
          <LogCallDialog
            accountId={accountId}
            contacts={contactOptions}
            defaultContactId={person.id}
            trigger={(open) => (
              <button type="button" onClick={open} className={`${GRID_BTN} ${BTN_RED}`}>
                Log call
              </button>
            )}
          />
          <TaskDialog
            mode="create"
            accountId={accountId}
            contacts={contactOptions}
            reps={reps}
            canAssignOthers={canAssignOthers}
            currentUser={currentUser}
            defaults={{ contact_id: person.id }}
            trigger={(open) => (
              <button type="button" onClick={open} className={`${GRID_BTN} ${BTN_RED}`}>
                Add task
              </button>
            )}
          />
          <QuickNoteDialog
            accountId={accountId}
            contactId={person.id}
            contactName={person.name}
            trigger={(open) => (
              <button type="button" onClick={open} className={`${GRID_BTN} ${BTN_RED}`}>
                Note
              </button>
            )}
          />
          {person.email ? (
            <a href={`mailto:${person.email}`} className={`${GRID_BTN} ${BTN_RED}`}>
              Email
            </a>
          ) : (
            <span
              aria-disabled
              title="No email on file"
              className={`${GRID_BTN} ${BTN_RED} cursor-not-allowed opacity-40`}
            >
              Email
            </span>
          )}
        </div>
      </div>
    </ClickableListItem>
  );
}
