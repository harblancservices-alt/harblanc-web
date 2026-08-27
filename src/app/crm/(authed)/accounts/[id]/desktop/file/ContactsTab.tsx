"use client";

import { ContactDialog } from "../../ContactDialog";
import { digitsForTel } from "../../../../_shell/contactFields";
import type { CallPerson } from "./WhoDoICall";
import { FileCard, SectionHead } from "./chrome";

/**
 * THE CONTACTS TAB — the full roster.
 *
 * ── WHY THIS IS NOT "WHO DO I CALL" AGAIN ─────────────────────────────
 *
 * This is the duplication risk in the whole feature, and it is handled by
 * giving the two panels different jobs and different shapes:
 *
 *   WHO DO I CALL (panel 01, top)   the SHORTLIST you act on. Primary
 *                                   contact first, capped at three, one
 *                                   number each, sized to be dialled. It
 *                                   answers "who am I ringing right now".
 *
 *   CONTACTS (this tab, bottom)     the ROSTER you maintain. Everybody,
 *                                   uncapped, as a table — every number
 *                                   not just the first, role, whether
 *                                   they decide, best time to call, when
 *                                   they were last reached. It answers
 *                                   "who works here and what do we know
 *                                   about them".
 *
 * The shortlist hands off to the roster rather than competing with it:
 * panel 01's "+N more" switches to this tab (see recordTabs.tsx).
 *
 * ── A TABLE, DELIBERATELY ─────────────────────────────────────────────
 *
 * Panel 01 is a list of cards with a big phone button. This is a dense
 * table with a row per person and a column per fact. Two different shapes
 * for two different jobs is the thing that stops a reader wondering which
 * one is authoritative — they are obviously not the same view.
 *
 * ── WHAT THE COLUMNS ARE WORTH TODAY, HONESTLY ────────────────────────
 *
 * Across all 64 contacts: role_category is set on 6, is_decision_maker on
 * 7, current_mood on 0, and NOBODY has a second phone number. So most of
 * these columns are empty on most people right now. They are here because
 * this is the surface where you FILL them in — every cell that has no
 * value renders as the thing that adds it, which is the same rule the rest
 * of the page follows. Mood is the one field left out entirely: zero of 64
 * and no way to set it here.
 */

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-line px-3 py-2.5 align-top">{children}</td>;
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 pb-2 text-left text-[10px] font-bold uppercase tracking-[0.09em] text-fg-subtle">
      {children}
    </th>
  );
}

/** An empty cell that is a way to fill it, not a dash. */
function Missing({
  label,
  accountId,
  companyName,
  person,
}: {
  label: string;
  accountId: string;
  companyName?: string;
  person: CallPerson;
}) {
  return (
    <ContactDialog
      accountId={accountId} companyName={companyName}
      mode="edit"
      defaults={person.defaults}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="text-[11.5px] font-semibold text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-accent"
        >
          {label}
        </button>
      )}
    />
  );
}

export function ContactsTab({
  accountId,
  companyName,
  people,
}: {
  accountId: string;
  companyName?: string;
  people: CallPerson[];
}) {
  if (people.length === 0) {
    return (
      <FileCard>
        <SectionHead title="Contacts" count="nobody yet" />
        <div className="px-4 py-10 text-center">
        <p className="text-[13px] font-bold text-fg">Nobody works here yet</p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] text-fg-subtle">
          Add the buyer, the shipping desk, whoever answers the phone. One name and
          one number is enough to start.
        </p>
        <ContactDialog
          accountId={accountId} companyName={companyName}
          mode="create"
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="mt-3 rounded-md bg-accent px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-accent-hover"
            >
              Add the first contact
            </button>
          )}
          />
        </div>
      </FileCard>
    );
  }

  return (
    <FileCard>
      <SectionHead
        title="Contacts"
        count={`${people.length} ${people.length === 1 ? "person" : "people"} on file`}
        action={
          <ContactDialog
            accountId={accountId} companyName={companyName}
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
      <div className="px-4 py-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <Head>Name</Head>
              <Head>Role</Head>
              <Head>Numbers</Head>
              <Head>Email</Head>
              <Head>Best time</Head>
              <Head>Last reached</Head>
              <Head>{""}</Head>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} id={`contact-row-${p.id}`} className="target:bg-accent-bg">
                <Cell>
                  <span className="text-[12.5px] font-bold text-fg">{p.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {p.isPrimary && (
                      <span className="rounded-[3px] border border-line-strong px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                        Call first
                      </span>
                    )}
                    {p.isDecisionMaker && (
                      <span className="rounded-[3px] border border-ok/40 bg-ok-bg px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-ok">
                        Decides
                      </span>
                    )}
                  </span>
                </Cell>

                <Cell>
                  {p.role || p.title ? (
                    <span className="text-[12px] text-fg-muted">{p.role ?? p.title}</span>
                  ) : (
                    <Missing label="set role" accountId={accountId} companyName={companyName} person={p} />
                  )}
                </Cell>

                {/* EVERY number, not just the first — this is the column
                    panel 01 deliberately does not have. */}
                <Cell>
                  {p.phones.length > 0 ? (
                    <span className="flex flex-col gap-0.5">
                      {p.phones.map((ph, i) => (
                        <a
                          key={`${ph.number}-${i}`}
                          href={`tel:${digitsForTel(ph.number)}`}
                          className="text-[12px] font-semibold text-fg hover:text-accent crm-num"
                        >
                          {ph.number}
                          {ph.label && (
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
                              {ph.label}
                            </span>
                          )}
                        </a>
                      ))}
                    </span>
                  ) : (
                    <Missing label="+ phone" accountId={accountId} companyName={companyName} person={p} />
                  )}
                </Cell>

                <Cell>
                  {p.email ? (
                    <a
                      href={`mailto:${p.email}`}
                      className="text-[12px] text-accent hover:underline"
                    >
                      {p.email}
                    </a>
                  ) : (
                    <Missing label="+ email" accountId={accountId} companyName={companyName} person={p} />
                  )}
                </Cell>

                <Cell>
                  {p.bestTimeToCall ? (
                    <span className="text-[12px] text-fg-muted">{p.bestTimeToCall}</span>
                  ) : (
                    <Missing label="when?" accountId={accountId} companyName={companyName} person={p} />
                  )}
                </Cell>

                <Cell>
                  <span className="text-[12px] text-fg-muted">{p.lastContactLabel}</span>
                </Cell>

                <Cell>
                  <ContactDialog
                    accountId={accountId} companyName={companyName}
                    mode="edit"
                    defaults={p.defaults}
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        className="text-[12px] font-bold text-accent hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  />
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </FileCard>
  );
}
