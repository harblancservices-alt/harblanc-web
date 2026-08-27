"use client";

import { useEffect, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import {
  Field,
  SelectField,
  TextareaField,
  SubmitButton,
  FormError,
} from "../../_shell/form";
import { PhonesEditor } from "../../_shell/PhonesEditor";
import { LinksEditor } from "../../_shell/LinksEditor";
import { MoodPicker } from "../../_shell/MoodPicker";
import { BTN_NEUTRAL } from "../../_shell/ui";
import type { PhoneEntry, LinkEntry } from "../../_shell/contactFields";
import { createContact, updateContact } from "../actions";
import { toDatetimeLocal } from "../../_shell/format";
import { CONTACT_ROLE_PRESETS, ROLE_OTHER, isPresetTitle } from "./contactRoles";
import { listCompanySites, type CompanySite } from "./location-actions";

export type ContactDefaults = {
  id?: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phones?: PhoneEntry[];
  links?: LinkEntry[];
  best_time_to_call?: string | null;
  notes?: string | null;
  next_followup_at?: string | null;
  /** A CrmPersonRoleCategory slug (see roles.ts), or null/unset — drives the
   * color-coded role pill everywhere a contact renders. NOT submitted by this
   * form directly; the server derives it from the chosen title. */
  role_category?: string | null;
  /** A ContactMood slug (see _shell/mood.ts), or null/unset. */
  current_mood?: string | null;
  /** crm_account_locations.id — which of the company's sites this person is
   * at. Null for most contacts; only meaningful where a company has more
   * than one. */
  location_id?: string | null;
};

/**
 * ADD / EDIT A CONTACT — rebuilt 2026-08-27 from Brent's four corrections.
 *
 * ── 1. IT SAYS WHICH COMPANY ──────────────────────────────────────────
 *
 * This was the actual bug. The dialog took an accountId and never showed it,
 * so opening it from the tasks-board gaps list — where several companies sit
 * stacked and their chips look alike — gave you a form titled "New contact"
 * with nothing on it naming the company you were about to file a person
 * against. There was no on-screen check against getting it wrong. The
 * company now sits in a band directly under the title.
 *
 * `companyName` is optional only because three long-dead call sites
 * (ContactsMasterDetail, ContactsWheel, HeaderActions — none of them reachable
 * from any route) still compile against this component. Every LIVE call site
 * passes it.
 *
 * ── 2. ROLE IS A DROPDOWN ─────────────────────────────────────────────
 *
 * Free text produced exactly what you would expect and what the live data
 * shows: "Purchasing Manager", "Manager, Purchasing" and "purchasing" for one
 * job. The fifteen presets live in contactRoles.ts with the roles.ts bucket
 * each belongs to, so one pick sets both the specific title and the pill
 * colour. "Other" reopens free text rather than forcing a wrong answer.
 *
 * The form submits only `title`; the server maps it (roleColumnsFromTitle in
 * ../actions.ts) and deliberately writes NO category for free text, so a
 * save can never wipe a role set from the inline RoleControl pills.
 *
 * ── 3. THE NOTE GOES ON THE COMPANY ───────────────────────────────────
 *
 * Brent was explicit, and the data already agreed: 1 of 31 notes in the
 * database is attached to a contact. What you learn while writing somebody
 * down is a fact about the account. On create, the note field writes a
 * crm_notes row against the COMPANY, which is what puts it in that company's
 * notes feed. The label says so rather than leaving it to be discovered.
 *
 * ── 4. TIGHTER ────────────────────────────────────────────────────────
 *
 * It opened with nine stacked blocks. The five that answer "who is this and
 * how do I reach them" are now the form; email, links, mood, best time to
 * call and the follow-up date moved behind one disclosure. Nothing was
 * removed — an edit still reaches every field it ever could.
 *
 * ── 5. THE SITE THEY ARE AT ───────────────────────────────────────────
 *
 * Built 2026-08-27, having been refused twice before on purpose:
 * crm_account_locations existed but crm_contacts had no column pointing at
 * it, and inventing a shape in the `custom` jsonb blob would have been worse
 * than saying so. It now has one (location_id, nullable, on delete set
 * null).
 *
 * The field only appears when the company has MORE THAN ONE site. Asking
 * "which site?" of a company with a single address is a question with one
 * answer, and today that is almost every company — 11 locations across 11
 * companies. The picker earns its place the moment a customer has a second
 * dock, and stays out of the way until then.
 *
 * The chosen site is re-checked against the company server-side
 * (siteColumnsForAccount in ../actions.ts) rather than trusted from the
 * form, the same rule the task composer applies to contact-against-company.
 */
export function ContactDialog({
  accountId,
  companyName,
  mode,
  defaults,
  trigger,
}: {
  accountId: string;
  /** The company this person is being filed against, shown in the dialog.
   * Optional only for unreachable legacy call sites — always pass it. */
  companyName?: string;
  mode: "create" | "edit";
  defaults?: ContactDefaults;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const d = defaults ?? {};

  // Which option the role <select> is showing. A title that matches a preset
  // selects it; any other non-empty title (every contact created before this
  // dropdown existed) opens on "Other" with its text preserved.
  const initialRole = isPresetTitle(d.title) ? (d.title as string) : d.title ? ROLE_OTHER : "";
  const [role, setRole] = useState<string>(initialRole);

  /** The company's own sites, loaded when the dialog opens rather than
   * threaded through a dozen call sites that would never read them. Empty
   * until then, and the field simply does not render — which is also the
   * right answer for the majority of companies, which have one site or
   * none and for whom "which site?" is not a question. */
  const [sites, setSites] = useState<CompanySite[]>([]);
  const [siteId, setSiteId] = useState<string>(d.location_id ?? "");

  useEffect(() => {
    if (!open) return;
    let live = true;
    void listCompanySites(accountId).then((rows) => {
      if (live) setSites(rows);
    });
    return () => {
      live = false;
    };
  }, [open, accountId]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createContact(accountId, formData)
          : await updateContact(d.id as string, accountId, formData);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        setRole(initialRole);
        setSiteId(d.location_id ?? "");
        setOpen(true);
      })}

      <Modal
        open={open}
        onClose={close}
        busy={pending}
        title={mode === "create" ? "New contact" : "Edit contact"}
      >
        {/* ── The company, named. ─────────────────────────────────── */}
        {companyName && (
          <div className="mb-3 rounded-md border border-line bg-inset px-3 py-2">
            <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-fg-muted">
              {mode === "create" ? "Adding to" : "At"}
            </span>
            <span className="mt-0.5 block truncate text-[14px] font-extrabold text-fg">
              {companyName}
            </span>
          </div>
        )}

        <FormError message={error} />

        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Field label="Name" name="name" required autoFocus defaultValue={d.name} />

          <SelectField
            label="Role"
            name="role_preset"
            defaultValue={initialRole}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">Select a role…</option>
            {CONTACT_ROLE_PRESETS.map((r) => (
              <option key={r.title} value={r.title}>
                {r.title}
              </option>
            ))}
            <option value={ROLE_OTHER}>Other…</option>
          </SelectField>

          {/* `title` is what actually submits. When a preset is chosen it
              rides along hidden; "Other" swaps in the real text box. Keeping
              one field name means the server has one thing to read and the
              role mapping has one input. */}
          {role === ROLE_OTHER ? (
            <Field
              label="Role (other)"
              name="title"
              placeholder="e.g. VP Operations"
              defaultValue={isPresetTitle(d.title) ? "" : d.title}
            />
          ) : (
            <input type="hidden" name="title" value={role} />
          )}

          <PhonesEditor defaultValue={d.phones} />

          {/* WHICH SITE. Only rendered when the company actually has more
              than one — asking "which site?" of a company with a single
              address is a question with one answer, and a control with one
              option is noise. */}
          {sites.length > 1 && (
            <SelectField
              label="Site they're at"
              name="location_id"
              defaultValue={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              <option value="">Not sure / head office</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </SelectField>
          )}

          {mode === "create" && (
            <TextareaField
              label="Note — saves to the company's notes feed"
              name="company_note"
              rows={3}
              placeholder="What did you learn? Goes on the company, not this person."
            />
          )}

          {/* ── Everything the form used to open with. ───────────── */}
          <details className="mt-1 rounded-md border border-line" open={mode === "edit"}>
            <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-bold text-fg-muted hover:text-fg">
              More fields
            </summary>
            <div className="flex flex-col gap-2 border-t border-line p-3">
              <Field
                label="Email"
                name="email"
                type="email"
                inputMode="email"
                defaultValue={d.email}
              />
              <LinksEditor defaultValue={d.links} />
              <MoodPicker defaultValue={d.current_mood} />
              <Field
                label="Best time to call"
                name="best_time_to_call"
                placeholder="e.g. Weekday AM"
                defaultValue={d.best_time_to_call}
              />
              <Field
                label="Next follow-up (CST)"
                name="next_followup_at"
                type="datetime-local"
                defaultValue={toDatetimeLocal(d.next_followup_at)}
              />
              {/* The contact's OWN notes column. Offered on edit only: it
                  holds live data that must stay editable, but on create the
                  one note field is the company note above, and two boxes
                  both labelled "note" is how you get facts filed in the
                  place nobody looks. */}
              {mode === "edit" && (
                <TextareaField label="Private note on this person" name="notes" defaultValue={d.notes} />
              )}
            </div>
          </details>

          <div className="mt-1 flex items-center gap-2">
            <SubmitButton pending={pending}>
              {mode === "create" ? "Save contact" : "Save changes"}
            </SubmitButton>
            {/* Escape and the corner × both already closed this. Neither says
                so, and the only visible way out was diagonally opposite the
                button your hand is on. */}
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className={`inline-flex h-9 items-center rounded-md px-4 text-[13px] font-semibold transition-colors max-lg:h-11 max-lg:text-[14px] ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
