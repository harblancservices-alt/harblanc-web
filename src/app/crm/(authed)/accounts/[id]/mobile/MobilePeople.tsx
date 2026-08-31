"use client";

import Link from "next/link";
import { ContactAvatar } from "../../../_shell/ContactAvatar";
import { digitsForTel, sameDialledNumber } from "../../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { IconMail, IconPhone } from "../../../_shell/icons";
import { ContactDialog, type ContactDefaults } from "../ContactDialog";
import { M_DIVIDE, M_ROUND, M_ROUND_SOLID } from "./ui";

export type MobilePerson = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  /** crm_contacts.name_unknown — a number with nobody's name on it. */
  nameUnknown?: boolean;
  /** Everything ContactDialog needs to open in edit mode — plain data. */
  defaults: ContactDefaults;
};

/**
 * PEOPLE — the company's contacts as phone-first rows: who they are, what
 * they do, and a one-tap Call / Text without opening anything first.
 *
 * Replaces ContactsMasterDetail on the phone. That component is a 260px
 * list column beside a detail pane — a layout that only resolves at `md:`
 * and collapses into a stacked list-then-pane scroll on a 390px screen.
 * Nothing it offered is lost: tapping a name opens that person's real
 * profile at /crm/contacts/[contactId] (which carries their history, notes,
 * mood and role controls), and Edit opens the same shared ContactDialog with
 * the same `updateContact` write. ContactsMasterDetail itself is untouched
 * and still serves every other caller.
 *
 * "use client" only because ContactDialog takes a `trigger` closure — every
 * prop reaching this component is plain serializable data, so no function
 * crosses the RSC boundary from the server page.
 */
export function MobilePeople({
  accountId,
  companyName,
  people,
  companyPhones = [],
}: {
  accountId: string;
  companyName?: string;
  people: MobilePerson[];
  /** The company's own numbers, so a contact whose only line IS the
   * switchboard can say so. Same rule and same helper as the desktop
   * panel — see WhoDoICall's note on preferring an instruction over a
   * disclaimer. Defaults to empty, so a caller that does not pass it
   * simply gets the old behaviour. */
  companyPhones?: { label: string; number: string }[];
}) {
  if (people.length === 0) {
    return (
      <p className="px-[13px] py-[18px] text-[12.5px] font-semibold text-fg-muted">
        No people on file yet — add the buyer, the shipping desk, whoever answers.
      </p>
    );
  }

  return (
    <div>
      {people.map((p, i) => {
        const tel = p.phone ? digitsForTel(p.phone) : null;
        return (
          <div key={p.id} className={`flex items-center gap-[11px] px-3 py-[11px] ${i === 0 ? "" : M_DIVIDE}`}>
            <ContactAvatar className="h-[38px] w-[38px]" />

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link
                  href={`/crm/contacts/${p.id}`}
                  className="min-w-0 truncate text-[14.5px] font-extrabold tracking-[-0.01em] text-fg transition-colors hover:text-accent"
                >
                  {p.name}
                </Link>
                {p.isPrimary && (
                  <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.07em] text-accent">
                    Primary
                  </span>
                )}
                {!p.isPrimary && p.isDecisionMaker && (
                  <span className="shrink-0 rounded-full bg-ok-bg px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.07em] text-ok">
                    DM
                  </span>
                )}
              </div>
              {p.title && <span className="block truncate text-[12px] font-semibold text-fg-muted">{p.title}</span>}
              {p.phone && (
                <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-fg-muted">
                  <span className="crm-num">{formatPhone(p.phone)}</span>
                  {companyPhones.some((c) => sameDialledNumber(c.number, p.phone)) && (
                    /* "ask for Name" is what this printed on a nameless
                       contact, whose name is the literal string "Name
                       unknown". The desktop hero already guarded it; this
                       row did not. */
                    <span className="text-fg-subtle">
                      {p.nameUnknown
                        ? " · ask who you are speaking to"
                        : ` · ask for ${p.name.split(" ")[0]}`}
                    </span>
                  )}
                </span>
              )}
              {p.email && (
                <span className="mt-0.5 block truncate text-[12px] font-semibold text-fg-muted">{p.email}</span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {tel ? (
                <>
                  <a href={`tel:${tel}`} aria-label={`Call ${p.name}`} className={M_ROUND_SOLID}>
                    <IconPhone width={15} height={15} />
                  </a>
                  <a href={`sms:${tel}`} aria-label={`Text ${p.name}`} className={M_ROUND}>
                    <IconMail width={15} height={15} />
                  </a>
                </>
              ) : p.email ? (
                <a href={`mailto:${p.email}`} aria-label={`Email ${p.name}`} className={M_ROUND}>
                  <IconMail width={15} height={15} />
                </a>
              ) : null}
              <ContactDialog
                accountId={accountId} companyName={companyName}
                mode="edit"
                defaults={p.defaults}
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className="inline-flex h-[33px] shrink-0 items-center rounded-[9px] border border-line-strong bg-card px-2.5 text-[12px] font-extrabold text-fg transition-colors hover:bg-inset"
                  >
                    {p.nameUnknown ? "Add name" : "Edit"}
                  </button>
                )}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
