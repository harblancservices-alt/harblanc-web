"use client";

import { BTN_DANGER, BTN_NEUTRAL, BTN_RED } from "../../_shell/ui";
import { ClickableListItem } from "../../_shell/ClickableRow";
import { lastContactStatus, timestampMs } from "../../_shell/format";
import { formatPhone } from "@/lib/domain/phone";
import { RoleControl } from "./RoleControl";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import type { RepOption } from "../CompanyDialog";
import type { CrmContact } from "./PersonCard";

const ACTION_BTN =
  "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors";

/**
 * The Contacts tab's full-width row — one line per contact, deliberately
 * DIFFERENT from the Overview tab's square PersonCard grid (they read as
 * the same thing during the first pass at this redesign; Brent's
 * correction split them back apart). Role pills across the top (inline,
 * instant-save via RoleControl — role-setting never goes through Edit
 * anymore), name/phone/email/last-contacted in the middle, and a full
 * action bar along the bottom: Log call / Add task / Note / Email (red
 * operational actions) plus Make/Unset primary (neutral, secondary), with
 * Delete pinned to the right edge, separated from the rest (owner-gated,
 * confirm required). No Edit button here on purpose — clicking the row
 * opens the contact's own profile page, which carries the full edit
 * dialog for everything besides role (name, phones, email, links, etc).
 */
export function ContactRow({
  accountId,
  person,
  reps,
  contactOptions,
  canAssignOthers,
  currentUser,
  isPrimary,
  onMakePrimary,
  onClearPrimary,
  canDelete,
  onDelete,
  busy,
  errorMessage,
}: {
  accountId: string;
  person: CrmContact;
  reps: RepOption[];
  contactOptions: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  isPrimary: boolean;
  onMakePrimary: () => void;
  onClearPrimary: () => void;
  canDelete: boolean;
  onDelete: () => void;
  busy: boolean;
  errorMessage: string | null;
}) {
  const primaryPhone = person.phones[0] ?? null;
  const lastContacted = lastContactStatus(timestampMs(person.last_contacted_at)).text;

  return (
    <ClickableListItem href={`/crm/contacts/${person.id}`} className="flex flex-col gap-3 px-5 py-4">
      <RoleControl
        contactId={person.id}
        accountId={accountId}
        current={person.role_category ?? null}
      />

      <div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14.5px] font-semibold text-fg">{person.name}</span>
          {isPrimary && (
            <span className="inline-flex items-center bg-steel-bg px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-steel">
              Primary
            </span>
          )}
          {person.title && <span className="text-[12.5px] text-fg-muted">{person.title}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
          {primaryPhone ? (
            <span className="font-mono text-fg-muted">
              {primaryPhone.label ? `${primaryPhone.label}: ` : ""}
              {formatPhone(primaryPhone.number)}
            </span>
          ) : (
            <span className="text-fg-subtle">No phone on file</span>
          )}
          {person.email ? (
            <a href={`mailto:${person.email}`} className="text-accent hover:underline">
              {person.email}
            </a>
          ) : (
            <span className="text-fg-subtle">No email on file</span>
          )}
          <span className="text-fg-subtle">Last contacted: {lastContacted}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <LogCallDialog
            accountId={accountId}
            contacts={contactOptions}
            defaultContactId={person.id}
            trigger={(open) => (
              <button type="button" onClick={open} className={`${ACTION_BTN} ${BTN_RED}`}>
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
              <button type="button" onClick={open} className={`${ACTION_BTN} ${BTN_RED}`}>
                Add task
              </button>
            )}
          />
          <QuickNoteDialog
            accountId={accountId}
            contactId={person.id}
            contactName={person.name}
            trigger={(open) => (
              <button type="button" onClick={open} className={`${ACTION_BTN} ${BTN_RED}`}>
                Note
              </button>
            )}
          />
          {person.email ? (
            <a href={`mailto:${person.email}`} className={`${ACTION_BTN} ${BTN_RED}`}>
              Email
            </a>
          ) : (
            <span
              aria-disabled
              title="No email on file"
              className={`${ACTION_BTN} ${BTN_RED} cursor-not-allowed opacity-40`}
            >
              Email
            </span>
          )}
          {isPrimary ? (
            <button
              type="button"
              onClick={onClearPrimary}
              disabled={busy}
              className={`${ACTION_BTN} ${BTN_NEUTRAL}`}
            >
              {busy ? "…" : "Unset primary"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onMakePrimary}
              disabled={busy}
              className={`${ACTION_BTN} ${BTN_NEUTRAL}`}
            >
              {busy ? "…" : "Make primary"}
            </button>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={`${ACTION_BTN} ${BTN_DANGER}`}
          >
            {busy ? "…" : "Delete"}
          </button>
        )}
      </div>

      {errorMessage && <p className="text-[12px] text-bad">{errorMessage}</p>}
    </ClickableListItem>
  );
}
