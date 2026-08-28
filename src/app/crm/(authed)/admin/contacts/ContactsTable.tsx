"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, DeleteIconButton, BTN_DANGER, BTN_NEUTRAL } from "../../_shell/ui";
import { Modal } from "../../_shell/Modal";
import { deleteContact } from "../../accounts/actions";
import { SegmentedTabs } from "../../_shell/SegmentedTabs";
import { ListSearch } from "../../_shell/ListSearch";
import { searchTokens } from "../../_shell/companySearch";
import { recentFirst } from "../../_shell/recentFirst";
import { CallAction, EmailAction, MobileEmpty, MobileList, MobileRow, MobileSearchBar } from "../../_shell/mobileList";
import { lastContactStatus, titleCaseWords, formatPhone } from "../../_shell/format";
import { temperatureOf } from "@/lib/crm/temperature";
import { TemperatureDot } from "../../_shell/TemperatureDot";
import type { AdminContactRow } from "./contacts-data";
import {
  countContactsByOwner,
  matchesContactOwner,
  ownerNamesOf,
  sortContactsForAdmin,
  UNLINKED,
} from "./contactRow";

/**
 * Admin → Contacts — every contact in the org, whoever owns the company
 * behind it. The sibling of Admin → Companies, and deliberately built to the
 * same pattern: Card + filter row of SegmentedTabs + one dense table,
 * unowned-first, coldest-first, rows linking through to the record.
 *
 * NO ASSIGNMENT HERE, unlike Companies. There is no select mode and no
 * assign rail: a contact has no owner of its own — it inherits one from its
 * company — so the way to reassign a contact is to reassign the company, on
 * the Companies tab. Adding a second, contact-shaped assignment path here
 * would create two answers to "who owns this".
 *
 * The one write it does own is DELETE (Brent, 2026-08-28: "under
 * administration under 'contact' we need a delete feature on the list line.
 * not on the company profile"). It reuses accounts/actions.ts::deleteContact
 * — the same owner-only soft delete the company profile already called —
 * rather than a second delete path with its own idea of what removal means.
 *
 * DESKTOP ONLY, deliberately. See the phone list below.
 */
export function ContactsTable({
  rows,
  ownerNames: roster,
  now,
}: {
  /** Server clock — never Date.now() during render (React Compiler purity
   * rule). One instant for every temperature in the table. */
  now: number;
  rows: AdminContactRow[];
  /** The full active roster — a person with zero contacts still gets a tab. */
  ownerNames: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  /** The row awaiting confirmation. Holding the ROW, not just an id, so the
   * dialog can name the person — a misclick on the wrong line is caught by
   * reading the name back, which an "Are you sure?" cannot do. */
  const [confirming, setConfirming] = useState<AdminContactRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirming) return;
    setRemoving(true);
    setError(null);
    // accountId is "" for a contact with no company: deleteContact only uses
    // it to clear a primary-contact pointer and to revalidate, and both are
    // no-ops for an empty id.
    const res = await deleteContact(confirming.id, confirming.accountId ?? "");
    setRemoving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setConfirming(null);
    router.refresh();
  }

  const sorted = useMemo(() => sortContactsForAdmin(rows), [rows]);
  // Roster first so somebody with nothing still gets a tab; ownerNamesOf
  // catches anyone attached to a company but no longer on the roster (a
  // departed teammate), who would otherwise have rows and no way to filter
  // to them.
  const ownerNames = useMemo(
    () => [...new Set([...roster, ...ownerNamesOf(rows)])].sort((a, b) => a.localeCompare(b)),
    [roster, rows],
  );
  const counts = useMemo(() => countContactsByOwner(rows, ownerNames), [rows, ownerNames]);
  /** Search a contact the way you would say them out loud: their name, the
   * company they work at, or the number you are trying to place. */
  const searched = useMemo(() => {
    const tokens = searchTokens(query);
    if (tokens.length === 0) return sorted;
    return sorted.filter((r) => {
      const hay = [r.name, r.companyName, r.title, r.email, r.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [sorted, query]);

  const visible = useMemo(
    () => searched.filter((r) => matchesContactOwner(r, filter)),
    [searched, filter],
  );

  /** PHONE ORDER, and only on the phone list. The table keeps its own
   * "no owner first, then coldest" sort, which is an admin triage order and
   * the right one at a desk. */
  const forPhone = useMemo(() => recentFirst(visible), [visible]);

  // Unlinked leads — same reasoning as Companies' Unassigned tab: a contact at
  // a company nobody owns is the one nobody is working.
  const filterItems = [
    { key: UNLINKED, label: "No owner", count: counts[UNLINKED] ?? 0, attention: true },
    { key: "all", label: "All", count: counts.all ?? 0, attention: false },
    ...ownerNames.map((n) => ({ key: n, label: n, count: counts[n] ?? 0, attention: false })),
  ].map((f) => ({
    key: f.key,
    label: f.label,
    active: filter === f.key,
    onSelect: () => setFilter(f.key),
    count: f.count,
    countNeedsAttention: f.attention,
  }));

  const unlinkedCount = counts[UNLINKED] ?? 0;

  return (
    <Card className="flex max-h-[calc(100vh-9rem)] flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">Contacts</h2>
        <p className="text-[12.5px] text-fg-muted">
          {rows.length} in the org · {unlinkedCount} at a company with no owner
        </p>
      </div>

      {/* SEARCH FIRST ON A PHONE — sticky, full width, above everything.
          On desktop it sits inline with the tabs as one more control. */}
      <div className="px-4 pt-3 lg:pb-0">
        <div className="lg:hidden">
          <MobileSearchBar>
            <ListSearch
              value={query}
              onChange={setQuery}
              label="Search contacts"
              placeholder="Search name, company or number…"
            />
          </MobileSearchBar>
        </div>
        <div className="hidden lg:block">
          <ListSearch
            value={query}
            onChange={setQuery}
            label="Search contacts"
            placeholder="Search name, company or number…"
            hint={searchTokens(query).length > 0 ? `${visible.length} shown` : null}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <SegmentedTabs ariaLabel="Contact owner" items={filterItems} />
        <p className="hidden text-[12px] text-fg-subtle lg:block">No owner first, then coldest</p>
      </div>

      {visible.length === 0 ? (
        <div className="px-4 pb-8 pt-4 text-center">
          <p className="text-[13.5px] font-semibold text-fg">Nothing here</p>
          <p className="mt-0.5 text-[12.5px] text-fg-muted">
            {filter === UNLINKED
              ? "Every contact sits at a company with an owner."
              : "No contacts under this filter."}
          </p>
        </div>
      ) : (
        <>
        {/* ══ PHONE: a stack of rows, no table. The desktop table below is
            880px wide at minimum, which on a 390px screen is a horizontal
            scrollbar and nothing else. ══ */}
        <div className="min-h-0 flex-1 overflow-auto lg:hidden">
          <MobileList>
            {forPhone.map((row) => (
              <MobileRow
                key={row.id}
                href={`/crm/contacts/${row.id}`}
                title={row.name}
                subtitle={
                  <>
                    {row.title ? `${row.title} · ` : ""}
                    {row.companyName ?? "No company"}
                  </>
                }
                meta={row.ownerName ? `Owner: ${row.ownerName}` : "Company has no owner"}
                /* NO DELETE ON THE PHONE LIST, deliberately. These
                   actions sit in a 6px-gap cluster at the right edge —
                   exactly where a thumb lands — and that cluster is
                   tap-to-call and tap-to-email, the two things this list was
                   optimised for in the field. A destructive control one
                   thumb-width from "call" is a misfire waiting to happen,
                   and the misfire deletes a person. Deleting a contact is an
                   admin desk action; it lives on the desktop table only. If
                   it is ever wanted on a phone it needs swipe-to-reveal or an
                   overflow menu, not a third icon in this row. */
                actions={
                  <>
                    <CallAction
                      phone={row.phone}
                      who={row.name}
                      emptyReason={`No phone number on ${row.name}`}
                    />
                    <EmailAction
                      email={row.email}
                      who={row.name}
                      emptyReason={`No email address on ${row.name}`}
                    />
                  </>
                }
              />
            ))}
          </MobileList>
          {forPhone.length === 0 && <MobileEmpty>Nothing matches that.</MobileEmpty>}
        </div>

        {/* ══ DESKTOP: unchanged. ══ */}
        <div className="hidden min-h-0 flex-1 overflow-auto lg:block">
          <table className="w-full min-w-[880px] border-collapse">
            <thead>
              <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                <th className="px-4 py-2 text-left">Contact</th>
                <th className="px-2 py-2 text-left">Company</th>
                <th className="px-2 py-2 text-left">Owner</th>
                <th className="px-2 py-2 text-left">Reach them</th>
                <th className="px-2 py-2 text-left">Last activity</th>
                <th className="w-28 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const contact = lastContactStatus(row.lastContactMs);
                // Measured against the COMPANY's stage clock — a contact has
                // no stage of its own. Same dot as the company cards.
                const temp = temperatureOf({
                  stage: row.companyStage,
                  lastContactMs: row.lastContactMs,
                  now,
                });
                const href = `/crm/contacts/${row.id}`;
                return (
                  <tr
                    key={row.id}
                    onClick={() => router.push(href)}
                    className="group cursor-pointer border-b border-line transition-colors hover:bg-accent-bg"
                  >
                    <td className="px-4 py-2.5">
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                        {titleCaseWords(row.name)}
                        {row.isDecisionMaker && (
                          <span className="rounded-[3px] border border-accent/40 px-1 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-accent">
                            DM
                          </span>
                        )}
                      </p>
                      {row.title && <p className="text-[11.5px] text-fg-subtle">{row.title}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px]">
                      {row.accountId && row.companyName ? (
                        <Link
                          href={`/crm/accounts/${row.accountId}`}
                          prefetch={false}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-accent hover:underline"
                        >
                          {titleCaseWords(row.companyName)}
                        </Link>
                      ) : (
                        <span className="font-semibold text-[#c0272d]">No company</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px]">
                      {row.ownerName ? (
                        <span className="text-fg">{row.ownerName}</span>
                      ) : (
                        <span className="font-semibold text-[#c0272d]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px] text-fg-muted">
                      {row.phone ? formatPhone(row.phone) : row.email ? row.email : "—"}
                    </td>
                    <td
                      className={`px-2 py-2.5 text-[12.5px] font-semibold ${
                        contact.freshness === "never"
                          ? "text-bad"
                          : contact.freshness === "cold"
                            ? "text-bad"
                            : contact.freshness === "aging"
                              ? "text-warn"
                              : "text-fg-muted"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <TemperatureDot temp={temp} />
                        {contact.text}
                      </span>
                    </td>
                    <td className="w-36 px-2 py-2.5">
                      {/* stopPropagation on the wrapper: the whole <tr> is a
                          link to the contact, and a click meant for Delete
                          must not also navigate away from the list. */}
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="invisible whitespace-nowrap text-[12px] font-semibold text-accent underline-offset-2 group-hover:visible">
                          Open &rsaquo;
                        </span>
                        <DeleteIconButton
                          label={titleCaseWords(row.name)}
                          onClick={() => setConfirming(row)}
                          disabled={removing}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Same confirmation shape as Admin -> Tasks and the Upgrades board.
          It NAMES the person and their company: on a dense table of similar
          rows, "Delete this contact?" confirms nothing useful, whereas
          reading back "Mike Bischof at Metallic Products Corporation" is
          what actually catches a click on the wrong line. */}
      {confirming && (
        <Modal
          open
          onClose={() => !removing && setConfirming(null)}
          busy={removing}
          title="Delete contact"
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{titleCaseWords(confirming.name)}</span>
            {confirming.companyName ? (
              <>
                {" "}
                at <span className="font-semibold">{titleCaseWords(confirming.companyName)}</span>
              </>
            ) : null}
            ? They come off every list straight away.
          </p>
          <p className="mt-2 text-[12.5px] text-fg-muted">
            Calls and notes already logged against them are kept, so the
            company&rsquo;s history stays intact.
          </p>
          {error && (
            <p className="mt-3 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={removing}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_DANGER}`}
            >
              {removing ? "Deleting…" : "Delete contact"}
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
