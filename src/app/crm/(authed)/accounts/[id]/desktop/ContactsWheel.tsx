"use client";

import Link from "next/link";
import { ContactAvatar } from "../../../_shell/ContactAvatar";
import { digitsForTel } from "../../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ContactDialog } from "../ContactDialog";
import { D_CAP, D_CARD, D_LINK, D_MONO } from "./ui";

export type WheelContact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  /** First number from the contact's `phones` jsonb, resolved by page.tsx. */
  phone: string | null;
  isPrimary: boolean;
};

const MINI = "flex-1 rounded-md border py-1 text-[11px] font-bold transition-colors";
const MINI_ON = "border-accent/40 bg-card text-accent hover:bg-accent/10";
const MINI_OFF = "border-line-strong bg-inset text-fg-muted opacity-60 pointer-events-none";

/**
 * DESKTOP-ONLY left-rail "Contacts" card — the handoff's "contact wheel": a
 * 280px-tall independently scrolling list with y-mandatory scroll snapping,
 * each contact a small card with avatar, name (+ PRIMARY pill for
 * crm_accounts.primary_contact_id), title, email link, mono phone, and
 * Call/Email actions. The primary contact's card is tinted.
 *
 * The full contact record (roles, moods, per-contact notes/activity/tasks)
 * still lives in ContactsMasterDetail — reachable by tapping a name, which
 * routes to that contact's own profile. This card is the at-a-glance roster,
 * matching the handoff; it deliberately does NOT duplicate the master-detail
 * panel.
 *
 * "+ Add" opens the same ContactDialog the rest of the CRM uses (create
 * mode → createContact), so a contact added here is identical to one added
 * from the mobile Contacts tab.
 */
export function ContactsWheel({
  accountId,
  contacts,
}: {
  accountId: string;
  contacts: WheelContact[];
}) {
  return (
    <div className={`${D_CARD} p-4 px-[18px]`}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className={D_CAP}>Contacts · {contacts.length}</span>
        <ContactDialog
          accountId={accountId}
          mode="create"
          trigger={(open) => (
            <button type="button" onClick={open} className={D_LINK}>
              + Add
            </button>
          )}
        />
      </div>

      {contacts.length === 0 ? (
        <p className="py-3 text-[12px] text-fg-muted">No contacts yet.</p>
      ) : (
        <div className="flex max-h-[280px] snap-y snap-mandatory flex-col gap-2 overflow-y-auto pr-0.5">
          {contacts.map((c) => (
            <div
              key={c.id}
              className={`flex flex-none snap-start flex-col gap-2 rounded-lg border p-3 ${
                c.isPrimary ? "border-accent/40 bg-accent/5" : "border-line-strong bg-card"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ContactAvatar className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/crm/contacts/${c.id}`}
                      prefetch={false}
                      className="min-w-0 truncate text-[13px] font-bold text-fg transition-colors hover:text-accent"
                    >
                      {c.name}
                    </Link>
                    {c.isPrimary && (
                      <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.05em] text-accent">
                        Primary
                      </span>
                    )}
                  </div>
                  {c.title && <div className="truncate text-[11px] font-medium text-fg-muted">{c.title}</div>}
                </div>
              </div>

              <div className="flex flex-col gap-0.5 text-[11px]">
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="truncate font-semibold text-accent transition-colors hover:text-accent-hover"
                  >
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${digitsForTel(c.phone)}`} className={`${D_MONO} font-medium text-fg hover:text-accent`}>
                    {formatPhone(c.phone)}
                  </a>
                )}
              </div>

              <div className="flex gap-1.5">
                {c.phone ? (
                  <a href={`tel:${digitsForTel(c.phone)}`} className={`${MINI} ${MINI_ON} text-center`}>
                    Call
                  </a>
                ) : (
                  <span className={`${MINI} ${MINI_OFF} text-center`}>Call</span>
                )}
                {c.email ? (
                  <a href={`mailto:${c.email}`} className={`${MINI} ${MINI_ON} text-center`}>
                    Email
                  </a>
                ) : (
                  <span className={`${MINI} ${MINI_OFF} text-center`}>Email</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
