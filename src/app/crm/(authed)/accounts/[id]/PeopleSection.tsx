"use client";

import { Card, CardHead, BTN_EDIT, ZEBRA_ROWS } from "../../_shell/ui";
import { IconContacts } from "../../_shell/icons";
import { digitsForTel, type PhoneEntry } from "../../_shell/contactFields";
import { lastContactStatus, timestampMs } from "../../_shell/format";
import { formatPhone } from "@/lib/domain/phone";
import { QuickNoteDialog } from "./QuickNoteDialog";
import { TaskDialog, type TaskContactOption } from "../../tasks/TaskDialog";
import type { RepOption } from "../CompanyDialog";

/**
 * The role/category vocabulary driving each person's color-coded tag —
 * crm_contacts.role_category (text, applied directly, no migration file).
 * Exported so ContactDialog's role picker shares this exact same vocabulary/
 * label set rather than a second copy that could drift.
 */
export type CrmPersonRoleCategory =
  | "purchasing"
  | "shipping_receiving"
  | "dispatch"
  | "manager_owner"
  | "sales";

export const ROLE_CATEGORIES: CrmPersonRoleCategory[] = [
  "purchasing",
  "shipping_receiving",
  "dispatch",
  "manager_owner",
  "sales",
];

export const ROLE_LABEL: Record<CrmPersonRoleCategory, string> = {
  purchasing: "Purchasing",
  shipping_receiving: "Shipping / Receiving",
  dispatch: "Dispatch",
  manager_owner: "Manager / Owner",
  sales: "Sales",
};

/** Green/amber/grey reuse the CRM's existing fixed status tints; purple has
 * no existing token so it's a one-off arbitrary pastel pair matching the
 * same light-bg/saturated-text shape; "blue" reuses the brand accent (the
 * same bg-accent/10 text-accent pairing DueCountdown already uses for its
 * "accent" tone) rather than inventing a second blue. */
export const ROLE_TONE: Record<CrmPersonRoleCategory, string> = {
  purchasing: "bg-ok-bg text-ok",
  shipping_receiving: "bg-warn-bg text-warn",
  dispatch: "bg-[#f1e8fb] text-[#7c3aed]",
  manager_owner: "bg-slate-bg text-slate",
  sales: "bg-accent/10 text-accent",
};

export type CrmPerson = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phones: PhoneEntry[];
  is_decision_maker: boolean;
  last_contacted_at?: string | null;
  /** A CrmPersonRoleCategory slug, or null when unset — anything else falls
   * back to a neutral chip in PersonRow rather than throwing. See the
   * module docstring above. */
  role_category?: string | null;
};

/**
 * "People at this company" — the Overview tab's compact, scannable roster
 * (distinct from the full CRUD list on the Contacts tab): role tag, direct
 * labeled line, email, last-contacted, and one-tap Call/Note/Task. Reuses the
 * same contacts data the page already fetches for the Contacts tab — no
 * second query. "Add person" now lives in the Tasks button bar above rather
 * than in this section's own header (see page.tsx/TasksSection.tsx) — this
 * card is display + quick-action only.
 */
export function PeopleSection({
  accountId,
  people,
  reps,
  contactOptions,
  canAssignOthers,
  currentUser,
}: {
  accountId: string;
  people: CrmPerson[];
  reps: RepOption[];
  contactOptions: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  return (
    <Card>
      <CardHead
        title="People at this company"
        hint={people.length ? `${people.length} on file` : undefined}
      />

      {people.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center bg-inset text-fg-subtle">
            <IconContacts />
          </span>
          <p className="text-[14px] font-semibold text-fg">No people yet</p>
          <p className="max-w-xs text-[13px] text-fg-muted">
            Add whoever you talk to at this company — purchasing, dispatch, receiving.
          </p>
        </div>
      ) : (
        <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
          {people.map((p) => (
            <PersonRow
              key={p.id}
              accountId={accountId}
              person={p}
              reps={reps}
              contactOptions={contactOptions}
              canAssignOthers={canAssignOthers}
              currentUser={currentUser}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PersonRow({
  accountId,
  person,
  reps,
  contactOptions,
  canAssignOthers,
  currentUser,
}: {
  accountId: string;
  person: CrmPerson;
  reps: RepOption[];
  contactOptions: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  const primaryPhone = person.phones[0] ?? null;
  const role = (person.role_category ?? null) as CrmPersonRoleCategory | null;
  const roleLabel = role ? ROLE_LABEL[role] : null;
  const roleTone = role ? ROLE_TONE[role] : "bg-inset text-fg-subtle";
  const lastContacted = lastContactStatus(timestampMs(person.last_contacted_at)).text;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold text-fg">{person.name}</span>
            {roleLabel && (
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleTone}`}
              >
                {roleLabel}
              </span>
            )}
            {person.is_decision_maker && (
              <span className="bg-ok-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ok">
                Decision-maker
              </span>
            )}
          </div>
          {person.title && <p className="mt-0.5 text-[12.5px] text-fg-muted">{person.title}</p>}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
            {primaryPhone && (
              <span className="font-mono text-fg-muted">
                {primaryPhone.label ? `${primaryPhone.label}: ` : ""}
                {formatPhone(primaryPhone.number)}
              </span>
            )}
            {person.email && (
              <a href={`mailto:${person.email}`} className="text-accent hover:underline">
                {person.email}
              </a>
            )}
          </div>
          <p className="mt-1 text-[11.5px] text-fg-subtle">Last contacted: {lastContacted}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {primaryPhone && (
            <a
              href={`tel:${digitsForTel(primaryPhone.number)}`}
              className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              Call
            </a>
          )}
          <QuickNoteDialog
            accountId={accountId}
            contactId={person.id}
            contactName={person.name}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                Note
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
              <button
                type="button"
                onClick={open}
                className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                + Task
              </button>
            )}
          />
        </div>
      </div>
    </li>
  );
}
