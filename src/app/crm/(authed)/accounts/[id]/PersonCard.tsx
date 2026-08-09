"use client";

import { BTN_DANGER, BTN_NEUTRAL, BTN_RED } from "../../_shell/ui";
import { ClickableListItem } from "../../_shell/ClickableRow";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { lastContactStatus, timestampMs } from "../../_shell/format";
import { formatPhone } from "@/lib/domain/phone";
import { ROLE_LABEL, ROLE_TONE, type CrmPersonRoleCategory } from "./roles";
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
 * The person card — shared by the Overview tab's "People at this company"
 * and the Contacts tab's full directory (Brent's approved mock: one card
 * design everywhere a contact renders, not two diverging layouts). Avatar +
 * name + role pill on top; below that, labeled phone/email/last-contacted on
 * the left BESIDE a compact 2×2 grid of red (dc2626) operational actions
 * (Log call / Add task / Note / Email) on the right. The card carries
 * `@container` and switches to that side-by-side layout at `@[340px]` — a
 * CONTAINER query on the card's own rendered width, not the viewport, since
 * the grid it sits in (see PeopleSection.tsx/ContactsSection.tsx) is itself
 * responsive (auto-fill, min 340px per card) — a card can be full-bleed-wide
 * with only 1-2 contacts on a huge monitor, or exactly 340px on a phone, and
 * either way this is the width that actually matters for whether info +
 * buttons fit side by side. Below that width the two stack (info above,
 * buttons below, full width) instead of cramming. Clicking the card
 * (anywhere that isn't one of its own buttons/links) opens
 * the contact's own profile page — see contacts/[contactId]/page.tsx — via
 * ClickableListItem, which already ignores clicks on nested interactive
 * elements. The primary-contact toggle and Delete are OPTIONAL: only the
 * Contacts tab's full directory passes them (Overview's roster stays
 * display + quick-action only, matching its original narrower scope), and
 * when present Delete is pinned to the right edge of its own footer row,
 * separated from every other action.
 */
export function PersonCard({
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
  isPrimary?: boolean;
  onMakePrimary?: () => void;
  onClearPrimary?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  busy?: boolean;
  /** Shown inline in the card's footer (e.g. a failed delete/primary-toggle)
   * — the caller owns which card it applies to (matched by id) so it renders
   * INSIDE this <li>, keeping every grid child a real <li> (ClickableListItem
   * already renders one) with nothing wrapping it. */
  errorMessage?: string | null;
}) {
  const primaryPhone = person.phones[0] ?? null;
  const role = (person.role_category ?? null) as CrmPersonRoleCategory | null;
  const roleLabel = role ? ROLE_LABEL[role] : null;
  const roleTone = role ? ROLE_TONE[role] : "bg-inset text-fg-subtle";
  const lastContacted = lastContactStatus(timestampMs(person.last_contacted_at)).text;
  const showFooter = Boolean(onMakePrimary || onClearPrimary || onDelete);

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
          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-semibold text-fg">{person.name}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {roleLabel && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleTone}`}
                >
                  {roleLabel}
                </span>
              )}
              {isPrimary && (
                <span className="inline-flex items-center bg-steel-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel">
                  Primary
                </span>
              )}
            </div>
          </div>
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

      {/* Info on the left, the 2x2 red action grid on the right — stacks
          (info above, buttons below, full-width) below the `sm` breakpoint
          so it never gets cramped on a phone. */}
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

      {showFooter && (
        <div className="flex items-center justify-between gap-2 border-t border-line-strong pt-2.5">
          <div>
            {isPrimary
              ? onClearPrimary && (
                  <button
                    type="button"
                    onClick={onClearPrimary}
                    disabled={busy}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${BTN_NEUTRAL}`}
                  >
                    {busy ? "…" : "Unset primary"}
                  </button>
                )
              : onMakePrimary && (
                  <button
                    type="button"
                    onClick={onMakePrimary}
                    disabled={busy}
                    className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${BTN_NEUTRAL}`}
                  >
                    {busy ? "…" : "Make primary"}
                  </button>
                )}
          </div>
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${BTN_DANGER}`}
            >
              {busy ? "…" : "Delete"}
            </button>
          )}
        </div>
      )}

      {errorMessage && <p className="text-[12px] text-bad">{errorMessage}</p>}
    </ClickableListItem>
  );
}
