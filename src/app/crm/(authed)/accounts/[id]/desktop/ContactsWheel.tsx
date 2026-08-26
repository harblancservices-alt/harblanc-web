"use client";

import { ContactAvatar } from "../../../_shell/ContactAvatar";
import { digitsForTel } from "../../../_shell/contactFields";
import { formatPhone } from "@/lib/domain/phone";
import { ContactDialog, type ContactDefaults } from "../ContactDialog";
import { ContactMoreMenu } from "../ContactMoreMenu";
import { D_CAP, D_CARD, D_LINK, D_MONO } from "./ui";

export type WheelContact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  /** First number from the contact's `phones` jsonb, resolved by page.tsx. */
  phone: string | null;
  isPrimary: boolean;
  /** Everything the standalone contact page used to own, now that this card
   * IS the contact profile (Brent, 2026-08-26). `defaults` is what the edit
   * dialog needs; the rest renders in the card's own detail row. */
  defaults: ContactDefaults;
  role: string | null;
  mood: string | null;
  bestTimeToCall: string | null;
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
 * THIS CARD IS NOW THE CONTACT PROFILE (Brent, 2026-08-26): "the profile
 * just opens their card on the profile of the company they work for". The
 * standalone /crm/contacts/[contactId] page is a redirect to this card.
 *
 * WHAT MOVED HERE from that page, so nothing worth keeping was lost with it:
 * Edit (the same ContactDialog it always used), Log call, and the role,
 * mood and best-time-to-call it displayed.
 *
 * WHAT DELIBERATELY DID NOT MOVE: its per-contact Tasks and Activity
 * sections. Those were a filtered view of data this page ALREADY shows in
 * full a few sections down, with the contact named on every row — so
 * duplicating them inside each card would put the same call on screen twice
 * and make a company with six contacts render its history seven times.
 *
 * ANCHORED AND HIGHLIGHTABLE. Each card carries `id="contact-<id>"` and
 * styles itself on `:target`, so arriving from a contact list scrolls to
 * the right person and rings them. Plain CSS — no script, and it survives
 * the full navigation a server redirect always produces.
 *
 * "+ Add" opens the same ContactDialog the rest of the CRM uses (create
 * mode → createContact), so a contact added here is identical to one added
 * from the mobile Contacts tab.
 */
export function ContactsWheel({
  accountId,
  contacts,
  canDelete,
}: {
  accountId: string;
  contacts: WheelContact[];
  /** Owner-only, same rule the retired contact page used. */
  canDelete: boolean;
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

      {/* NO INNER SCROLLER (2026-08-26). The list below was max-h-[280px]
          with overflow-y-auto, which made a scroll region inside a page that
          already scrolls: you got ~2.5 people and a second scrollbar to find
          the rest. Defensible when the profile was a fixed two-column layout
          with tabs; the page is one scroll now, so the list grows and the
          page handles it. */}
      {contacts.length === 0 ? (
        <p className="py-3 text-[12px] text-fg-muted">No contacts yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              id={`contact-${c.id}`}
              // TARGET STYLES LAST, and an OUTLINE rather than a ring.
              // Two bugs found on screen: `ring-2` produced no box-shadow at
              // all here, and the isPrimary classes were appended AFTER the
              // target: ones, so on a primary contact — the likeliest one to
              // arrive at — the highlight lost the cascade to the styling it
              // was meant to override. An outline also sits outside the box,
              // so highlighting cannot nudge the layout by a pixel.
              className={`flex flex-none scroll-mt-24 flex-col gap-2 rounded-lg border p-3 transition-colors ${
                c.isPrimary ? "border-accent/40 bg-accent/5" : "border-line-strong bg-card"
              } target:bg-accent-bg target:outline target:outline-2 target:outline-offset-2 target:outline-accent`}
            >
              <div className="flex items-center gap-2.5">
                <ContactAvatar className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {/* Not a link any more: this card IS the destination. */}
                    <span className="min-w-0 truncate text-[13px] font-bold text-fg">{c.name}</span>
                    {c.isPrimary && (
                      <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.05em] text-accent">
                        Primary
                      </span>
                    )}
                    {/* Log a call and Delete — the two actions the retired
                        contact page's More menu owned. Delete in particular
                        existed NOWHERE on the company profile, so losing the
                        page would have quietly lost the only way to remove a
                        person. Same component, moved next to the card. */}
                    <span className="ml-auto shrink-0">
                      <ContactMoreMenu
                        contactId={c.id}
                        contactName={c.name}
                        accountId={accountId}
                        canDelete={canDelete}
                      />
                    </span>
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

              {(c.role || c.mood || c.bestTimeToCall) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                  {c.role && (
                    <span className="rounded-[3px] border border-line-strong px-1.5 py-px font-semibold text-fg-muted">
                      {c.role}
                    </span>
                  )}
                  {c.mood && (
                    <span className="rounded-[3px] border border-line-strong px-1.5 py-px font-semibold text-fg-muted">
                      {c.mood}
                    </span>
                  )}
                  {c.bestTimeToCall && (
                    <span className="text-fg-subtle">Best: {c.bestTimeToCall}</span>
                  )}
                </div>
              )}

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
                {/* Edit came from the retired contact page. Same dialog, same
                    action — only the place you reach it from changed. */}
                <ContactDialog
                  accountId={accountId}
                  mode="edit"
                  defaults={c.defaults}
                  trigger={(open) => (
                    <button type="button" onClick={open} className={`${MINI} ${MINI_ON} text-center`}>
                      Edit
                    </button>
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
