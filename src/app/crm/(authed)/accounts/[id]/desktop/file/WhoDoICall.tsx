"use client";

import { useState } from "react";
import Link from "next/link";
import { ContactDialog, type ContactDefaults } from "../../ContactDialog";
import { EditCompany } from "../../EditCompany";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";
import { digitsForTel, sameDialledNumber } from "../../../../_shell/contactFields";
import { FileCard, SectionHead } from "./chrome";

/**
 * PANEL 01 — WHO DO I CALL.
 *
 * The first question a rep asks standing on a company, so it is the first
 * panel. Rebuilt 2026-08-28 from the mockup Brent picked ("Version C").
 *
 * ── ONE PERSON UP FRONT, THE REST FOLDED AWAY ─────────────────────────
 *
 * The panel answers its own title literally: ONE person is the call, and
 * everybody else is a roster you open when the first one does not work
 * out. The old layout gave every contact an equal row and a company-line
 * footer, which cost roughly 400px to show a single person — Brent's
 * complaint, and the thing this fixes: one contact now renders in ~200px
 * because the hero IS the panel.
 *
 * ── THE NUMBER IS ON THE BUTTON ───────────────────────────────────────
 *
 * Brent, 2026-08-28: "i would rather have 'call main line' be the persons
 * phone number not the entire company... display the persons phone number
 * ON the button." So the button reads the actual digits in the mono face,
 * and the separate number line that used to sit above it is gone — the
 * number appears exactly once.
 *
 * ── TELLING HIM WHAT TO DO, NOT WHAT IS TRUE ──────────────────────────
 *
 * Where the hero's number is the COMPANY SWITCHBOARD rather than their own
 * line — six people at Metallic Products share (713) 856-9696 — the button
 * carries a second line: "Main line · ask for Mike".
 *
 * That wording is deliberate and it is the rule for this panel. The
 * alternative was a caveat sitting beside the button ("no direct line").
 * It lost, on Brent's reasoning: an unobservant rep will not read a note
 * NEXT to a control, but will read the control they are about to press —
 * and an instruction ("ask for Mike") survives that where a disclaimer
 * ("this is not his line") does not. WHERE THERE IS A CHOICE IN THIS
 * PANEL, PREFER TELLING SOMEBODY WHAT TO DO OVER TELLING THEM WHAT IS
 * TRUE.
 *
 * The second line appears ONLY when the number really is the company main.
 * A contact with their own direct line gets digits and nothing else.
 *
 * ── THE ROLE CARRIES WEIGHT ───────────────────────────────────────────
 *
 * "Purchasing Manager" was light grey secondary text. It is how Brent
 * decides who to ring, so it is now the same ink as the name at weight
 * 700 in the hero, and --fg-muted at 600 in the roster.
 *
 * ── WHAT IS NOT HERE ANY MORE ─────────────────────────────────────────
 *
 * The pinned COMPANY LINE footer. On Metallic it printed the same digits
 * the hero already shows. It now renders only when it adds something: a
 * company line no contact carries, or a company with nobody on file.
 */

export type CallPerson = {
  id: string;
  name: string;
  /** crm_contacts.name_unknown — a number off a BOL with nobody's name
   * against it. Still the number to dial; just not a person yet. */
  nameUnknown: boolean;
  title: string | null;
  email: string | null;
  /** Every stored number, label included. First is the one to try. */
  phones: { label: string; number: string }[];
  isPrimary: boolean;
  /** "reached today 1:15 PM" / "never called" — already derived by the
   * page from crm_contacts.last_contacted_at. */
  lastContactLabel: string;
  defaults: ContactDefaults;
  role: string | null;
  isDecisionMaker: boolean;
  bestTimeToCall: string | null;
};

function PhoneGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.6a1 1 0 0 1-.25 1Z" />
    </svg>
  );
}

/**
 * WHO GOES UP FRONT. Stated plainly because a rep should be able to predict
 * it without being told twice:
 *
 *   1. the person flagged CALL FIRST (crm_contacts primary) — a human made
 *      that decision and nothing derived should overrule it
 *   2. otherwise a decision maker — the person who can say yes
 *   3. otherwise whoever has a number, because a hero nobody can ring is
 *      not a hero
 *   4. otherwise the first person on the list
 *
 * Each rule only breaks ties left by the one above it, so the order is
 * stable: the same company shows the same face every time it is opened.
 */
export function pickHero(people: CallPerson[]): CallPerson | null {
  if (people.length === 0) return null;
  return (
    people.find((p) => p.isPrimary) ??
    people.find((p) => p.isDecisionMaker && p.phones.length > 0) ??
    people.find((p) => p.isDecisionMaker) ??
    people.find((p) => p.phones.length > 0) ??
    people[0]
  );
}

export function WhoDoICall({
  accountId,
  companyName,
  people,
  companyPhones,
  companyDefaults,
  reps,
  onOpenContacts,
}: {
  accountId: string;
  companyName?: string;
  people: CallPerson[];
  companyPhones: { label: string; number: string }[];
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  /** Opens the Contacts tab in the record below — the full roster with
   * editing, which this panel deliberately is not. */
  onOpenContacts: () => void;
}) {
  const [rosterOpen, setRosterOpen] = useState(false);

  const hero = pickHero(people);
  const rest = hero ? people.filter((p) => p.id !== hero.id) : [];
  const heroPhone = hero?.phones[0] ?? null;

  /** True when the hero's number is the company switchboard. Drives the
   * button's second line and nothing else. */
  const heroOnMain =
    heroPhone !== null && companyPhones.some((c) => sameDialledNumber(c.number, heroPhone.number));

  /** The company line is only worth a row when it is NOT already the number
   * on the hero's button. This is what stops the Metallic duplication. */
  const companyLine = companyPhones[0] ?? null;
  const companyLineIsNew =
    companyLine !== null && !people.some((p) => p.phones.some((ph) => sameDialledNumber(ph.number, companyLine.number)));

  const heroMeta = hero
    ? [
        hero.phones.length === 0 ? null : heroOnMain ? "No direct line" : null,
        hero.lastContactLabel || null,
      ].filter(Boolean)
    : [];

  return (
    <FileCard className="flex flex-col">
      <SectionHead
        title="Who do I call"
        count={
          people.length === 0
            ? "nobody yet"
            : `${people.length} ${people.length === 1 ? "person" : "people"}`
        }
        action={
          <ContactDialog
            accountId={accountId} companyName={companyName}
            mode="create"
            trigger={(open) => (
              /* A REAL BUTTON, IN RED — Brent's call, 2026-08-27. The one
                 action that fixes an unworkable company is allowed to
                 shout. It breaks the app's own "red means late or
                 destructive" rule knowingly; see the commit that added it. */
              <button
                type="button"
                onClick={open}
                className="inline-flex min-h-9 items-center rounded-md bg-bad px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-bad/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/40"
              >
                + person
              </button>
            )}
          />
        }
      />

      {hero === null ? (
        /* Not an apology — the fixable thing, with the fix attached. */
        <div className="flex-1 px-4 py-8 text-center">
          <p className="text-[13px] font-bold text-fg">Nobody is on file here</p>
          <p className="mx-auto mt-1 max-w-[34ch] text-[12px] text-fg-subtle">
            This company cannot be worked until somebody has a name and a number.
          </p>
          <ContactDialog
            accountId={accountId} companyName={companyName}
            mode="create"
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="mt-3 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-[12.5px] font-bold text-white transition-colors hover:bg-accent-hover"
              >
                Add the first contact
              </button>
            )}
          />
        </div>
      ) : (
        <>
          {/* ── THE HERO ─────────────────────────────────────────── */}
          <div id={`contact-${hero.id}`} className="flex flex-col gap-2.5 px-3 py-3 target:bg-accent-bg">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                  hero.isPrimary ? "bg-warn" : "bg-line-strong"
                }`}
              />
              <div className="min-w-0 flex-1">
                {/* THE NAME OPENS THE PERSON. /crm/contacts/[id] carries
                    their history and notes, and until 2026-08-28 desktop was
                    the one surface with no way to reach it — mobile, Admin ->
                    Contacts and task rows all linked there, this did not.
                    It used to open the edit dialog instead; editing has its
                    own explicit control on the Contacts tab, and the phone
                    and email affordances below still open the dialog, so
                    nothing lost a route. */}
                <Link
                  href={`/crm/contacts/${hero.id}`}
                  prefetch={false}
                  className="block max-w-full truncate text-left text-[16px] font-extrabold tracking-[-0.015em] text-fg hover:text-accent hover:underline"
                >
                  {hero.name}
                </Link>
                {/* THE ROLE, at the name's own weight — this is how Brent
                    decides who to ring, so it stopped being grey. */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {hero.title ? (
                    <span className="text-[12.5px] font-bold leading-snug text-fg">{hero.title}</span>
                  ) : hero.nameUnknown ? (
                    /* More useful than "No title recorded" here: it says
                       where the number came from and what to do with it,
                       which is the whole content of this record. */
                    <span className="text-[12.5px] font-semibold leading-snug text-fg-subtle">
                      Number off their BOL · nobody named on it
                    </span>
                  ) : (
                    <span className="text-[12.5px] font-semibold leading-snug text-fg-subtle">
                      No title recorded
                    </span>
                  )}
                  {hero.isDecisionMaker && (
                    <span className="rounded-[3px] bg-accent-bg px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      Decision maker
                    </span>
                  )}
                </div>
                {heroMeta.length > 0 && (
                  <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">{heroMeta.join(" · ")}</p>
                )}
              </div>
            </div>

            <div className="flex items-stretch gap-2">
              {heroPhone ? (
                <a
                  href={`tel:${digitsForTel(heroPhone.number)}`}
                  className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-px rounded-lg bg-accent px-3 py-2 text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="crm-num flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em]">
                    <PhoneGlyph className="h-3.5 w-3.5 shrink-0 fill-white opacity-90" />
                    {heroPhone.number}
                  </span>
                  {/* The instruction, not the disclaimer. Only when the
                      number really is the switchboard. */}
                  {/* "ask for <first name>" needs a first name. On a
                      contact that is only a number — a BOL that printed a
                      phone against a blank Contact line — there is nobody
                      to ask for, and splitting the placeholder would have
                      produced "ask for Name". The instruction becomes the
                      one that actually applies, and it is the same action
                      the gap on this company is asking for. */}
                  {heroOnMain && (
                    <span className="text-[10.5px] font-semibold text-white/75">
                      {hero.nameUnknown
                        ? "Main line · ask who you are speaking to"
                        : `Main line · ask for ${hero.name.split(" ")[0]}`}
                    </span>
                  )}
                </a>
              ) : (
                <ContactDialog
                  accountId={accountId} companyName={companyName}
                  mode="edit"
                  defaults={hero.defaults}
                  trigger={(open) => (
                    <button
                      type="button"
                      onClick={open}
                      className="flex min-h-[52px] flex-1 items-center justify-center rounded-lg border border-dashed border-line-strong text-[12.5px] font-semibold text-fg-subtle transition-colors hover:border-accent hover:text-accent"
                    >
                      + phone — nowhere to ring them
                    </button>
                  )}
                />
              )}

              {hero.email ? (
                <a
                  href={`mailto:${hero.email}`}
                  aria-label={`Email ${hero.name}`}
                  className="inline-flex min-h-[52px] min-w-11 items-center justify-center rounded-lg border border-line-strong bg-card px-3.5 text-[12px] font-bold text-accent transition-colors hover:bg-accent-bg"
                >
                  Email
                </a>
              ) : (
                <ContactDialog
                  accountId={accountId} companyName={companyName}
                  mode="edit"
                  defaults={hero.defaults}
                  trigger={(open) => (
                    <button
                      type="button"
                      onClick={open}
                      className="inline-flex min-h-[52px] min-w-11 items-center justify-center rounded-lg border border-line bg-inset px-3.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:border-accent hover:text-accent"
                    >
                      + email
                    </button>
                  )}
                />
              )}
            </div>
          </div>

          {/* ── THE FOLD ─────────────────────────────────────────── */}
          {rest.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setRosterOpen((v) => !v)}
                aria-expanded={rosterOpen}
                className="flex min-h-10 items-center gap-1.5 border-t border-line bg-inset px-3 text-left text-[11.5px] font-bold text-accent transition-colors hover:bg-accent-bg"
              >
                <span aria-hidden>{rosterOpen ? "▴" : "▾"}</span>
                {rosterOpen ? "Hide" : `${rest.length} more`}
                {!rosterOpen && (heroOnMain ? " people on this number" : rest.length === 1 ? " person" : " people")}
              </button>

              {rosterOpen && (
                <div className="border-t border-line">
                  {rest.map((p, i) => {
                    const phone = p.phones[0] ?? null;
                    return (
                      <div
                        key={p.id}
                        id={`contact-${p.id}`}
                        className={`flex min-h-11 items-center gap-2.5 px-3 py-1.5 target:bg-accent-bg ${
                          i > 0 ? "border-t border-line" : ""
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            p.isPrimary ? "bg-warn" : "bg-line-strong"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/crm/contacts/${p.id}`}
                            prefetch={false}
                            className="block max-w-full truncate text-left text-[12.5px] font-semibold leading-snug text-fg hover:text-accent hover:underline"
                          >
                            {p.name}
                          </Link>
                          <p
                            className={`truncate text-[11.5px] font-semibold leading-snug ${
                              p.title ? "text-fg-muted" : "text-fg-subtle"
                            }`}
                          >
                            {p.title ?? "No title recorded"}
                          </p>
                        </div>
                        {phone && (
                          <a
                            href={`tel:${digitsForTel(phone.number)}`}
                            aria-label={`Call ${p.name}`}
                            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-line bg-card text-accent transition-colors hover:border-accent hover:bg-accent-bg"
                          >
                            <PhoneGlyph className="h-3.5 w-3.5 fill-accent" />
                          </a>
                        )}
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            aria-label={`Email ${p.name}`}
                            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-line bg-card text-[12px] font-bold text-accent transition-colors hover:border-accent hover:bg-accent-bg"
                          >
                            @
                          </a>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={onOpenContacts}
                    className="w-full border-t border-line px-3 py-2 text-left text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent-bg"
                  >
                    Open Contacts to edit the full roster
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── THE COMPANY LINE, only when it adds something ───────────
          It used to be pinned here always, printing the same digits the
          hero's button now carries. It appears when the company has a line
          nobody is attached to, or when there is nobody on file at all. */}
      {(companyLineIsNew || people.length === 0) && (
        <div className="mt-auto flex items-center gap-3 border-t border-line px-3 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-fg-muted">
            Company line
          </span>
          <div className="ml-auto flex items-center gap-2">
            {companyLine && (
              <a
                href={`tel:${digitsForTel(companyLine.number)}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-card px-3 transition-colors hover:border-accent hover:bg-accent-bg"
              >
                <PhoneGlyph className="h-3.5 w-3.5 shrink-0 fill-accent" />
                <span className="crm-num text-[13px] font-bold text-fg">{companyLine.number}</span>
              </a>
            )}
            <EditCompany
              defaults={companyDefaults}
              reps={reps}
              variant="link"
              label={companyLine ? "+ number" : "+ add a company line"}
            />
          </div>
        </div>
      )}
    </FileCard>
  );
}
