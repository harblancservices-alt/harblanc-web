"use client";

import { ContactDialog, type ContactDefaults } from "../../ContactDialog";
import { EditCompany } from "../../EditCompany";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";
import { digitsForTel } from "../../../../_shell/contactFields";
import { FileCard, SectionHead, Rule } from "./chrome";

/**
 * PANEL 01 — WHO DO I CALL.
 *
 * The first question a rep asks standing on a company, so it is the first
 * panel. Every row is one person and one number, and the number is the
 * biggest thing on the row because dialling it is the point.
 *
 * ── THE PHONE IS A REAL LINK ──────────────────────────────────────────
 *
 * Drawn as a bordered button in the mockup, and it behaves like one: it is
 * a tel: link, so on a desk phone integration or a laptop with a softphone
 * it dials. The type label beside it (CELL / DESK / MAIN) is the phone's
 * own stored label from crm_contacts.phones, uppercased — not a guess about
 * which kind of number it is.
 *
 * ── SOMEBODY WITH NO NUMBER GETS A DASHED SLOT, NOT A BLANK ───────────
 *
 * A person on file with nowhere to ring them is a specific, fixable
 * problem, and the dashed "+ phone" says so and opens their edit dialog on
 * the spot. A blank space says nothing and gets scrolled past.
 *
 * ── WHAT THE MOCKUP SHOWS THAT THE DATA DOES NOT ──────────────────────
 *
 * The three people on the mockup — Dale Fritz, Maria Sanchez, Bobby Kern,
 * with cells, desks and emails — do not exist. The real Fritz Industries
 * record has ZERO contacts, and 555-01xx numbers are the giveaway. So this
 * panel's empty state is not a rare edge case, it is what most companies
 * render today, and it is built to be the useful thing on the page rather
 * than an apology: it says nobody is on file and puts the button to fix
 * that under your cursor.
 */

export type CallPerson = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  /** Every stored number, label included. First is the one to try. */
  phones: { label: string; number: string }[];
  isPrimary: boolean;
  /** "reached today 1:15 PM" / "never called" — already derived by the
   * page from crm_contacts.last_contacted_at. */
  lastContactLabel: string;
  defaults: ContactDefaults;
  /** ── Roster fields. Not rendered here — the shortlist deliberately shows
   * one number and nothing else — but carried on the same type because the
   * Contacts tab is built from exactly this list and a second, wider type
   * for the same people is how two views start disagreeing. */
  role: string | null;
  isDecisionMaker: boolean;
  bestTimeToCall: string | null;
};

function PhoneButton({ label, number }: { label: string | null; number: string }) {
  return (
    <a
      href={`tel:${digitsForTel(number)}`}
      className="flex shrink-0 items-center gap-2 rounded-md border border-line bg-card px-3 py-2 transition-colors hover:border-accent hover:bg-accent-bg"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-accent">
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1Z" />
      </svg>
      <span className="text-[13px] font-bold text-fg crm-num">{number}</span>
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-fg-subtle">
          {label}
        </span>
      )}
    </a>
  );
}

/**
 * How many people the SHORTLIST shows before handing off to the roster.
 *
 * Three, because the shortlist answers "who am I ringing right now" and a
 * fourth name has never been the answer to that. The most contacts any one
 * company has today is six, so this bites on very few — but it is what makes
 * this panel a shortlist rather than the Contacts tab rendered twice, and it
 * holds when a company finally has fifteen people on it.
 */
const SHORTLIST = 3;

export function WhoDoICall({
  accountId,
  people,
  companyPhones,
  companyDefaults,
  reps,
  onOpenContacts,
}: {
  accountId: string;
  /** Everybody on the company. This panel shows the first few; the Contacts
   * tab shows them all. */
  people: CallPerson[];
  companyPhones: { label: string; number: string }[];
  /** Defaults for the company edit dialog, so "+ number" has somewhere to
   * go — the company line lives on crm_accounts, not on a contact. */
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  /** Opens the Contacts tab in the record below. Supplied by FileBody,
   * which owns that state — see FileBody.tsx for why this is a prop and
   * not a context. */
  onOpenContacts: () => void;
}) {
  const shown = people.slice(0, SHORTLIST);
  const overflow = people.length - shown.length;
  const shortlistLabel =
    overflow > 0
      ? `first ${shown.length} of ${people.length}`
      : `${people.length} ${people.length === 1 ? "person" : "people"}`;

  return (
    <FileCard className="flex flex-col">
      <SectionHead
        n="01"
        title="Who do I call"
        count={people.length === 0 ? "nobody yet" : shortlistLabel}
        action={
          <ContactDialog
            accountId={accountId}
            mode="create"
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="text-[12px] font-bold text-accent hover:underline"
              >
                + person
              </button>
            )}
          />
        }
      />

      <div className="flex-1">
        {people.length === 0 ? (
          /* Not an apology — the fixable thing, with the fix attached. */
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-bold text-fg">Nobody is on file here</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[12px] text-fg-subtle">
              This company cannot be worked until somebody has a name and a number.
            </p>
            <ContactDialog
              accountId={accountId}
              mode="create"
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  className="mt-3 rounded-md bg-file-on px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-file-on-hover"
                >
                  Add the first contact
                </button>
              )}
            />
          </div>
        ) : (
          shown.map((p, i) => {
            const phone = p.phones[0] ?? null;
            const meta = [p.title, p.lastContactLabel].filter(Boolean);
            return (
              <div key={p.id}>
                {i > 0 && <Rule />}
                <div
                  id={`contact-${p.id}`}
                  className="flex items-center gap-3 px-4 py-3 target:bg-accent-bg"
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      p.isPrimary ? "bg-warn" : "bg-line-strong"
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ContactDialog
                        accountId={accountId}
                        mode="edit"
                        defaults={p.defaults}
                        trigger={(open) => (
                          <button
                            type="button"
                            onClick={open}
                            className="min-w-0 truncate text-[13.5px] font-extrabold text-fg hover:text-accent hover:underline"
                          >
                            {p.name}
                          </button>
                        )}
                      />
                      {p.isPrimary && (
                        <span className="shrink-0 rounded-[3px] border border-line-strong px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                          Call first
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                      {meta.join(" · ")}
                      {p.email ? (
                        <>
                          {meta.length > 0 && " · "}
                          <a
                            href={`mailto:${p.email}`}
                            className="text-accent hover:underline"
                          >
                            {p.email}
                          </a>
                        </>
                      ) : (
                        <>
                          {meta.length > 0 && " · "}
                          <ContactDialog
                            accountId={accountId}
                            mode="edit"
                            defaults={p.defaults}
                            trigger={(open) => (
                              <button
                                type="button"
                                onClick={open}
                                className="font-semibold text-accent hover:underline"
                              >
                                + email
                              </button>
                            )}
                          />
                        </>
                      )}
                    </p>
                  </div>

                  {phone ? (
                    <PhoneButton label={phone.label || null} number={phone.number} />
                  ) : (
                    <ContactDialog
                      accountId={accountId}
                      mode="edit"
                      defaults={p.defaults}
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          className="shrink-0 rounded-md border border-dashed border-line-strong px-6 py-2 text-[12px] font-semibold text-fg-subtle transition-colors hover:border-accent hover:text-accent"
                        >
                          + phone
                        </button>
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── The hand-off to the roster ───────────────────────────────
          This is what stops panel 01 and the Contacts tab being the same
          list twice: the shortlist stops, says how many it stopped at, and
          opens the tab that has the rest. */}
      {overflow > 0 && (
        <button
          type="button"
          onClick={onOpenContacts}
          className="border-t border-line px-4 py-2 text-left text-[12px] font-semibold text-accent hover:bg-accent-bg"
        >
          + {overflow} more {overflow === 1 ? "person" : "people"} — open Contacts
        </button>
      )}

      {/* ── The company's own line, pinned to the bottom ─────────────── */}
      <div className="mt-auto flex items-center gap-3 border-t border-line px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-fg-muted">
          Company line
        </span>
        <div className="ml-auto flex items-center gap-2">
          {companyPhones[0] ? (
            <PhoneButton
              label={companyPhones[0].label || "Main"}
              number={companyPhones[0].number}
            />
          ) : null}
          <EditCompany
            defaults={companyDefaults}
            reps={reps}
            variant="link"
            label={companyPhones[0] ? "+ number" : "+ add a company line"}
          />
        </div>
      </div>
    </FileCard>
  );
}
