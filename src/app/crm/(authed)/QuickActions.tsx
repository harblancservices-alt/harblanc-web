"use client";

import { useState } from "react";
import Link from "next/link";
import { IconPlus, IconTasks, IconPhone } from "./_shell/icons";
import { AddContactDialog } from "./contacts/AddContactDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";
import { Modal } from "./_shell/Modal";
import {
  TaskComposer,
  type ComposerCompany,
  type ComposerContactOption,
} from "./tasks/TaskComposer";
import type { QuickTask } from "./admin/quick-task-actions";
import { CompanyDialog, type RepOption } from "./accounts/CompanyDialog";
import { LogCallDialog } from "./calls/LogCallDialog";
import { BTN_CREATE, BTN_EDIT } from "./_shell/ui";

/**
 * The dashboard's quick-actions strip, each wired to an existing dialog via
 * its `trigger` render prop. Split into small Client Components (rather than
 * building the `trigger` callbacks inline in page.tsx) because `trigger` is
 * a function prop — a Server Component can never hand a closure to a Client
 * Component (same rule buildCrmNav's docstring calls out for icon
 * components). page.tsx only ever passes these plain, serializable data.
 * Rendered inside QuickActionsStrip.tsx, which supplies the horizontal-
 * scroll row layout shared with the (Link-only) Research Queue pill.
 *
 * Visual weight: 2026-08-20 crm-design catch-up. Was a row of 5 equally-
 * weighted solid pill buttons (`rounded-full`, raw #2563eb hex) predating
 * crm-design entirely ("Brent's approved Command Center mockup" — an older,
 * since-superseded design pass) — confirmed live against production as a
 * genuine crm-design mismatch, not just a stale comment. crm-design's own
 * dashboard has exactly one solid primary action ("Add company," in the
 * page header) and nothing else competing with it. These 5 actions are real
 * working functionality the prototype never had to design for, so they're
 * kept, not deleted — but demoted to BTN_EDIT's low-emphasis outline
 * treatment (same token every other secondary action in the CRM uses) and
 * the design system's crisp `rounded-md` shape, so "Add company" in the
 * header reads as the one obvious primary action and this strip reads as
 * secondary shortcuts underneath it, matching crm-design's actual hierarchy
 * instead of a row of five undifferentiated pills.
 */

const BUTTON_CLASS =
  `inline-flex h-9.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[12.5px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${BTN_EDIT}`;

/* THE THREE CREATE ACTIONS ON THIS STRIP. Same size and layout as the row
   around them -- colour only, per Brent. Filled rather than outlined: an
   outlined button on this light strip is what read as grey in the earlier
   passes, which is the whole reason it was raised. "Log call" keeps the
   outline: it was not named, and whether logging a call counts as creating
   a record is his call, not mine. */
const CREATE_CLASS =
  `inline-flex h-9.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[12.5px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad ${BTN_CREATE}`;

export function QuickAddContactButton({ companies }: { companies: CompanyOption[] }) {
  return (
    <AddContactDialog
      companies={companies}
      trigger={(open) => (
        <button type="button" onClick={open} className={CREATE_CLASS}>
          <IconPlus width={18} height={18} />
          Add contact
        </button>
      )}
    />
  );
}

export function QuickAddCompanyButton({ reps }: { reps: RepOption[] }) {
  return (
    <CompanyDialog
      mode="create"
      reps={reps}
      trigger={(open) => (
        <button type="button" onClick={open} className={CREATE_CLASS}>
          <IconCompanyPlus width={18} height={18} />
          Add company
        </button>
      )}
    />
  );
}

/** Small "+ Add" pill in the dashboard header — opens the full Add-company
 * dialog. Distinct from the cockpit's own big "Add company" tile below it. */
export function HeaderAddCompanyButton({ reps }: { reps: RepOption[] }) {
  return (
    <CompanyDialog
      mode="create"
      reps={reps}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          /* The header's own Add-company pill. Same action as the strip's,
             so the same colour -- one button must not be red below and blue
             above. */
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[13.5px] font-bold transition-colors ${BTN_CREATE}`}
        >
          <IconPlus width={16} height={16} />
          Add
        </button>
      )}
    />
  );
}

/** A company's id/name — {@link CompanyOption} shape, kept as its own name
 * here for callers of this file's exported type. */
export type QuickCallContactOption = { id: string; name: string; accountId?: string | null };

/**
 * The dashboard's "Log call" tile — no fixed company/contact context.
 * `accounts`/`contacts` are accepted for caller compatibility (page.tsx
 * still passes the org roster down) but no longer needed: LogCallDialog now
 * self-fetches everything it needs for its own linked contact/company/phone
 * comboboxes and cross-autofill.
 */
export function QuickLogCallButton({
  accounts: _accounts,
  contacts: _contacts,
}: {
  accounts?: CompanyOption[];
  contacts?: QuickCallContactOption[];
}) {
  return (
    <LogCallDialog
      trigger={(open) => (
        <button type="button" onClick={open} className={BUTTON_CLASS}>
          <IconPhone width={18} height={18} />
          Log call
        </button>
      )}
    />
  );
}

/**
 * "Add task" on the dashboard's CREATE bar.
 *
 * Opens the SHARED TaskComposer (tasks/TaskComposer.tsx) — the same one
 * Admin → Overview uses, with its quick-task buttons, instructions,
 * what-done-looks-like and the high-priority-needs-a-date rule. It used to
 * open TaskDialog, an older and much thinner form, which is exactly the
 * bug Brent hit: two task-making surfaces, one of which knew about none of
 * that.
 *
 * No "who" picker: an agent is making work for themselves. That matches
 * every assignment gate in the CRM (all role === "owner") and sendTask
 * enforces it server-side regardless.
 */
export function QuickAddTaskButton({
  companies,
  contacts,
  quickTasks,
  currentUser,
}: {
  companies: ComposerCompany[];
  contacts: ComposerContactOption[];
  quickTasks: QuickTask[];
  currentUser: { id: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={CREATE_CLASS}>
        <IconTasks width={18} height={18} />
        Add task
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a task" wide>
        <TaskComposer
          assignee={{ kind: "self", id: currentUser.id, label: currentUser.label }}
          companies={companies}
          contacts={contacts}
          quickTasks={quickTasks}
          // Org-shared vocabulary; addQuickTask/removeQuickTask are
          // owner-only on the server, so the controls are hidden rather
          // than shown and then failing.
          canEditQuickTasks={false}
          chrome="bare"
        />
      </Modal>
    </>
  );
}

/** "Research Queue" pill — the strip's one non-dialog entry, a plain link
 * down to the Needs Research widget rather than a create flow. Same pill
 * shape/color as the dialog buttons above so the strip reads as one row of
 * equally-weighted actions. */
export function QuickResearchQueueButton() {
  return (
    <Link href="#needs-research" className={BUTTON_CLASS}>
      <IconResearch width={18} height={18} />
      Research Queue
    </Link>
  );
}

function IconResearch(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  );
}

/** Small building-plus glyph for "Add company" — the CRM icon set has no
 * dedicated company-create icon, so this composes IconCompanies' building
 * shape with a plus badge rather than reusing the bare IconPlus (which
 * "Add contact" already uses). */
function IconCompanyPlus(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16" />
      <path d="M12 10h5a1 1 0 0 1 1 1v3" />
      <path d="M3 21h13" />
      <path d="M7.5 7.5h.01M7.5 11h.01M7.5 14.5h.01" />
      <circle cx="19" cy="17" r="3.25" />
      <path d="M19 15.75v2.5M17.75 17h2.5" />
    </svg>
  );
}
