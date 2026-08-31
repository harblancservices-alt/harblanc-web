"use client";

import { useState, useTransition, type ReactNode } from "react";
import { sourceLabel } from "../../../../admin/companies/companyRow";
import { isBolRole, ROLE_FULL } from "../../provenance";
import { useRouter } from "next/navigation";
import { fillCompanyGap } from "../../details-actions";
import { ContactDialog } from "../../ContactDialog";
import { EditCompany } from "../../EditCompany";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";
import type { BolFacts } from "./bolFacts";
import type { FileGap } from "./fileGaps";
import { GapChip, GapChipInput, GapChipRow } from "../../../../_shell/gapChip";
import { FileCard, SectionHead, Micro } from "./chrome";
import { BolViewer, type BolDoc } from "./BolViewer";
import { ParsedFields } from "./ParsedFields";
import { ResearchColumn } from "./ResearchColumn";
import { RecordColumn, type RecordFacts } from "./RecordColumn";
import type { ResearchGuess } from "./researchGuesses";
import type { Lookup } from "./lookups";

/**
 * PANEL 04 — WHAT WE KNOW.
 *
 * Two halves and one honest split: on the left, what the paperwork already
 * told us; on the right, what nobody has asked yet.
 *
 * ── LEFT: FROM BOLS ───────────────────────────────────────────────────
 *
 * Every row is derived from real crm_bol_entries rows by file/bolFacts.ts,
 * which documents at length what the mockup showed that the data cannot
 * support — equipment per lane, and an average weight. Neither is rendered.
 *
 * The scale is worth being blunt about: 14 BOL entries exist in total, 6 of
 * them matched to a shipper, across 6 different companies. The other 93
 * companies get the empty state, and the empty state says which company
 * would populate this rather than pretending the feature is broken.
 *
 * ── "CONFIRM" IS NOT BUILT ────────────────────────────────────────────
 *
 * The mockup puts a "confirm" (and sometimes "review") action on every
 * parsed row. There is nowhere to record the answer: crm_bol_entries has no
 * confirmed/reviewed column, and ai_confirmed_fields on the account is a
 * different mechanism with no writer left in the codebase. A button that
 * looks like it records a decision and records nothing is worse than no
 * button, so the rows read as facts and the action is flagged for Brent.
 *
 * ── RIGHT: GAPS ───────────────────────────────────────────────────────
 *
 * The same list the header counts (file/fileGaps.ts), each one FIXABLE
 * WHERE IT SITS — type the answer on the line, press enter, the row goes.
 * Finding a contact is the exception and opens the real dialog, for the
 * same reason it does on the dashboard: a person is a name, a title, a
 * number and an email, and one text box would make bad records faster.
 *
 * There is no "BLOCKS QUALIFIED" chip. No such gate exists in this app —
 * see fileGaps.ts.
 */

function Row({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-4 border-t border-line py-2.5 first:border-t-0">
      <span className="w-[72px] shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
        {label ?? ""}
      </span>
      <div className="min-w-0 flex-1 text-[12.5px] text-fg">{children}</div>
    </div>
  );
}

export function WhatWeKnow({
  accountId,
  companyName,
  facts,
  bolDocs,
  source,
  bolRole,
  linkedPanel,
  gaps,
  allFieldsCount,
  companyDefaults,
  reps,
  active,
  research,
}: {
  accountId: string;
  /** Named in the contact dialog the "somebody to call" gap opens. */
  companyName?: string;
  facts: BolFacts;
  /** The BOL PDFs themselves, newest first — joined company ->
   * crm_bol_entries -> crm_documents in page.tsx. See BolViewer. */
  bolDocs: BolDoc[];
  /** crm_accounts.source / bol_role — shown as a labelled row here as
   * well as a pill on the header. */
  source: string | null;
  bolRole: string | null;
  /** The "Linked company" control — the other companies off the same
   * bill of lading. Built on the server in page.tsx; null when this BOL
   * produced no other live company, which is the common case. */
  linkedPanel: ReactNode;
  gaps: FileGap[];
  /** How many detail fields the record has in total — the footer's honest
   * "there is more than this" count. */
  allFieldsCount: number;
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  /** True while this tab is open. Forwarded to the viewer, which does not
   * fetch a 288KB-5.2MB scan until somebody actually looks at it. */
  active: boolean;
  /**
   * EVERYTHING THE RESEARCH BRANCH NEEDS, built on the server.
   *
   * Present always; USED only when this company has no bill of lading. See
   * the branch below — a company with a document keeps the document, and a
   * company without one gets the column that tells an agent what to go and
   * find out. Two different jobs for the same half of the panel.
   */
  research: {
    record: RecordFacts;
    guesses: ResearchGuess[];
    lookups: Lookup[];
    exemplar: { id: string; name: string; line: string } | null;
    lastCallNote: string | null;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  /* See the Row that uses this. Plain derivation, no memo: it is a scan of
     at most a couple of hundred small objects and it changes whenever the
     documents do. */
  /* The same two facts the header pills carry, as plain text. */
  const sourceRow = source ? sourceLabel(source) : null;
  const roleRow = isBolRole(bolRole) ? ROLE_FULL[bolRole] : null;

  const roles = new Set(bolDocs.map((d) => d.role));
  const freightLabel =
    roles.size === 1 && roles.has("shipper")
      ? "Ships"
      : roles.size === 1 && roles.has("consignee")
        ? "Receives"
        : "Freight";
  /** Which BOL is open. Held HERE, not inside the viewer, because both
   * halves follow it — the document on the left and the fields on the
   * right have to be showing the same BOL or the whole point of putting
   * them side by side is lost. */
  const [bolIndex, setBolIndex] = useState(0);
  const openDoc = bolDocs[bolIndex] ?? null;

  const visible = gaps.filter((g) => !filled.has(g.kind));

  function save(kind: string) {
    const v = value.trim();
    if (!v) return;
    setError(null);
    startTransition(async () => {
      const res = await fillCompanyGap(accountId, kind, v);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistic — then refresh, so a half-succeeded save brings the row
      // back rather than leaving it gone on a lie.
      setFilled((prev) => new Set(prev).add(kind));
      setEditing(null);
      setValue("");
      router.refresh();
    });
  }

  // Its own card and header again (2026-08-26). RecordTabs owned both for
  // a few hours while this was a tab inside panel 04; that tier is gone —
  // What we know is a page-level tab now, so it is a card in its own right
  // like the three on Overview.
  return (
    <FileCard className="flex min-h-0 flex-1 flex-col">
      {/* No sub-line. It used to read "Shipper record — carrier fields
          (MC, DOT, insurance, safety) don't render here", which explained an
          absence nobody had asked about and cost a row of vertical space on
          the tab whose whole job is showing a document. */}
      <SectionHead title="What we know" />

      {/* ══════════════════════════════════════════════════════════════
          THE NO-DOCUMENT BRANCH (2026-08-31).

          84 of 103 companies have no bill of lading, and for every one of
          them the two largest regions of this panel used to say the same
          thing twice: that a document was missing. Nothing else filled
          them, on the tab whose name promises what we know.

          So when there is no document the halves do different work — the
          RECORD on the left (what we know) and the RESEARCH column on the
          right (how to find the rest). The document branch below is
          untouched: a company with a BOL still gets the scan, the parsed
          fields and the linked-company control exactly as before.
          ══════════════════════════════════════════════════════════════ */}
      {bolDocs.length === 0 ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col overflow-y-auto border-r border-line">
            {/* Source stays visible here. Brent, 2026-08-29: it "used to be
                obvious and is now hidden in the top bar". */}
            {(sourceRow || roleRow) && (
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-4 py-2">
                {sourceRow && (
                  <span className="text-[12.5px] text-fg">
                    <Micro className="text-fg">Source</Micro>{" "}
                    <span className="font-bold">{sourceRow}</span>
                  </span>
                )}
                {roleRow && (
                  <span className="text-[12.5px] text-fg">
                    <Micro className="text-fg">Role</Micro>{" "}
                    <span className="font-bold">{roleRow}</span>
                  </span>
                )}
              </p>
            )}
            <RecordColumn facts={research.record} />
            {/* A BOL-less company can still be linked to one off another
                company's document, so this stays reachable. */}
            {linkedPanel}
          </div>

          <ResearchColumn
            accountId={accountId}
            companyName={companyName ?? ""}
            gaps={visible}
            guesses={research.guesses}
            lookups={research.lookups}
            exemplar={research.exemplar}
            lastCallNote={research.lastCallNote}
          />
        </div>
      ) : (
      <>
      {/* Two halves: the document on the left, what was read off it — and
          then what we know beyond it — on the right. `items-stretch` so the
          viewer's own column fills the taller side rather than floating. */}
      {/* The DOCUMENT takes the extra width on a wide monitor, not the
          fields. A BOL is portrait, so the viewer's useful width is roughly
          0.77x its height — give it more and the browser fits by height and
          letterboxes the rest in grey. The fields need far less: they are
          label-plus-value rows whose longest line is capped for readability
          anyway. Even so 1.25fr, not 2fr — past that the document is all
          letterbox and the fields are a thin strip miles away. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ══ LEFT: the bill of lading itself, no chrome ═══════════
            The only line is the divider between the halves, and it belongs
            to this grid rather than to the viewer. */}
        {/* A HAIRLINE, bottom and right only — Brent: "super super super
            small". Enough that the scan does not read as bleeding off the
            edge of the panel, and not a frame around it. --line, not
            --line-strong, which is the emphasized mid-grey this used to
            carry as the divider between the two halves. Nothing on the top
            or left, so the document still runs into the corner. */}
        <div className="border-b border-r border-line">
          <BolViewer docs={bolDocs} index={bolIndex} onIndex={setBolIndex} active={active} />
        </div>

        {/* ══ RIGHT: parsed facts, then the company record ═════════ */}
        <div className="flex min-w-0 flex-col overflow-y-auto">
        {/* ── The fields read off the open document ─────────────────── */}
        {openDoc && <ParsedFields doc={openDoc} total={bolDocs.length} />}

        {/* DIRECTLY UNDER THE PARSED PARTIES, which is where it belongs:
            the document names two ends of a load, the fields above list
            them, and this is the one you can go and open. Putting it in
            the header or a side rail would separate the link from the
            reason it exists. It renders nothing at all when the BOL named
            no other live company. */}
        {linkedPanel}

        {/* ── ACROSS EVERY BOL — only worth drawing when there IS more
            than one, since with a single document the aggregate is the
            fields above repeated. ─────────────────────────────────────── */}
        <div className={bolDocs.length > 1 || facts.parsed === 0 ? "border-t border-line px-4 py-3" : "hidden"}>
          <p className="mb-1">
            <Micro className="text-fg-muted">From BOLs</Micro>
            <span className="ml-2 text-[11.5px] text-fg-subtle">
              {facts.parsed === 0
                ? "none on file"
                : `${facts.parsed} parsed`}
            </span>
          </p>

          {facts.parsed === 0 ? (
            <p className="py-6 text-[12.5px] leading-relaxed text-fg-subtle">
              No bills of lading are matched to this company yet. When one is
              processed and matched to them — as the shipper, the receiver or
              the bill-to — their lanes, the freight and who hauled it last
              will appear here on their own.
            </p>
          ) : (
            <div>
              {facts.lanes.map((lane, i) => (
                <Row key={i} label={i === 0 ? "Lanes" : undefined}>
                  <span className="font-semibold">
                    {lane.from ?? "unknown"} → {lane.to ?? "unknown"}
                  </span>
                  <span className="text-fg-muted">
                    {" · "}
                    {lane.loads} {lane.loads === 1 ? "load" : "loads"}
                  </span>
                  {lane.commodities.length > 0 && (
                    <span className="text-fg-muted"> · {lane.commodities.join(", ")}</span>
                  )}
                </Row>
              ))}

              {/* LABELLED BY WHAT THIS COMPANY ACTUALLY DID.
                  This row said "Ships" unconditionally, which was safe
                  only while the panel showed shipper matches alone. It
                  now shows receivers too, and telling a warehouse that
                  they "ship" the steel arriving on their dock is simply
                  false. Mixed roles get the neutral word rather than a
                  coin-flip between two specific ones. */}
              {facts.ships.length > 0 && (
                <Row label={freightLabel}>{facts.ships.join(", ")}</Row>
              )}

              {facts.lastBol && (
                <Row label="Last BOL">
                  {[
                    facts.lastBol.date,
                    facts.lastBol.number ? `BOL #${facts.lastBol.number}` : null,
                    facts.lastBol.weight,
                    /* Same rule as the Carrier row in ParsedFields: our own
                       name is not a fact about this company. A third-party
                       carrier still shows. */
                    facts.lastBol.carrier && !/harblanc/i.test(facts.lastBol.carrier)
                      ? `hauled by ${facts.lastBol.carrier}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Row>
              )}
            </div>
          )}
        </div>

        {/* ── THE COMPANY RECORD ───────────────────────────────────
            Beneath the parsed facts rather than beside them: the BOL says
            what they shipped, this says what we know about them as a
            customer. Two different kinds of knowledge, read in that order. */}
        <div className="border-t border-line-strong px-4 py-3">
          {/* WHERE THIS RECORD CAME FROM, as a plain labelled row.
              Brent, 2026-08-29: the source "used to be obvious and is now
              hidden in the top bar". It was: the desktop rebuild on
              2026-08-26 dropped the old details grid, and the two files
              that carried a Source row (AtAGlanceCard, CompanyProfileGrid)
              have been unreachable since. Mobile kept its row; desktop had
              none, so the header pill was the only place it existed.

              Two places showing the same fact is redundancy on purpose
              here, not duplication - one of them is always in view. */}
          {(sourceRow || roleRow) && (
            <p className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-2">
              {sourceRow && (
                <span className="text-[12.5px] text-fg">
                  <Micro className="text-fg-muted">Source</Micro>{" "}
                  <span className="font-bold">{sourceRow}</span>
                </span>
              )}
              {roleRow && (
                <span className="text-[12.5px] text-fg">
                  <Micro className="text-fg-muted">Role</Micro>{" "}
                  <span className="font-bold">{roleRow}</span>
                </span>
              )}
            </p>
          )}

          <p className="mb-1">
            <Micro className="text-fg-muted">Gaps</Micro>
            <span className="ml-2 text-[11.5px] text-fg-subtle">
              {visible.length === 0 ? "nothing missing" : "ask on the next call"}
            </span>
          </p>

          {error && (
            <p className="my-1.5 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
              {error}
            </p>
          )}

          {visible.length === 0 ? (
            <p className="py-6 text-[12.5px] text-fg-subtle">
              Everything this record asks for is filled in.
            </p>
          ) : (
            /* STRUCTURE A, the same chips the Dashboard and Tasks draw.
               This panel used to render a numbered "1. 2." list with the
               inputs pushed to a 160px column on the far right, so the
               biggest gaps surface in the app was the one place Brent's
               chosen treatment did not appear. The chip classes, the
               inline editor and the blocking-is-red rule now come from
               _shell/gapChip.tsx, which both surfaces import. */
            <GapChipRow>
              {visible.map((gap) =>
                gap.needsForm ? (
                  <ContactDialog
                    key={gap.kind}
                    accountId={accountId}
                    companyName={companyName}
                    mode="create"
                    trigger={(open) => (
                      <GapChip
                        label={gap.label}
                        title={
                          gap.blocking
                            ? "Nothing can happen here until somebody is on file to call"
                            : gap.why
                        }
                        blocking={gap.blocking}
                        onClick={open}
                      />
                    )}
                  />
                ) : editing === gap.kind ? (
                  <GapChipInput
                    key={gap.kind}
                    value={value}
                    onChange={setValue}
                    onSubmit={() => save(gap.kind)}
                    onCancel={() => {
                      setEditing(null);
                      setValue("");
                    }}
                    placeholder={gap.placeholder ?? ""}
                    ariaLabel={gap.label}
                    pending={pending}
                  />
                ) : (
                  <GapChip
                    key={gap.kind}
                    label={gap.label}
                    title={gap.why}
                    blocking={gap.blocking}
                    onClick={() => {
                      setEditing(gap.kind);
                      setValue("");
                      setError(null);
                    }}
                  />
                ),
              )}
            </GapChipRow>
          )}
        </div>
        </div>
      </div>

      </>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="flex items-baseline gap-2 border-t border-line px-4 py-2.5">
        <EditCompany
          defaults={companyDefaults}
          reps={reps}
          variant="link"
          label={`All fields (${allFieldsCount})`}
        />
        <span className="text-[11.5px] text-fg-subtle">
          the full record — everything above plus the fields nobody has needed yet
        </span>
      </div>
    </FileCard>
  );
}
