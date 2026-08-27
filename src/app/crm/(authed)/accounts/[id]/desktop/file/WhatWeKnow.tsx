"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fillCompanyGap } from "../../details-actions";
import { ContactDialog } from "../../ContactDialog";
import { EditCompany } from "../../EditCompany";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";
import type { BolFacts } from "./bolFacts";
import type { FileGap } from "./fileGaps";
import { FileCard, SectionHead, Micro } from "./chrome";

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
  facts,
  gaps,
  allFieldsCount,
  companyDefaults,
  reps,
}: {
  accountId: string;
  facts: BolFacts;
  gaps: FileGap[];
  /** How many detail fields the record has in total — the footer's honest
   * "there is more than this" count. */
  allFieldsCount: number;
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

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

  return (
    <FileCard>
      <SectionHead
        n="04"
        title="What we know"
        count="Shipper record — carrier fields (MC, DOT, insurance, safety) don't render here"
      />

      <div className="grid grid-cols-2">
        {/* ── FROM BOLS ─────────────────────────────────────────────── */}
        <div className="border-r border-line px-4 py-3">
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
              processed and matched to them as the shipper, their lanes, what
              they ship and who hauled it last will appear here on their own.
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

              {facts.ships.length > 0 && (
                <Row label="Ships">{facts.ships.join(", ")}</Row>
              )}

              {facts.lastBol && (
                <Row label="Last BOL">
                  {[
                    facts.lastBol.date,
                    facts.lastBol.number ? `BOL #${facts.lastBol.number}` : null,
                    facts.lastBol.weight,
                    facts.lastBol.carrier ? `hauled by ${facts.lastBol.carrier}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Row>
              )}
            </div>
          )}
        </div>

        {/* ── GAPS ──────────────────────────────────────────────────── */}
        <div className="px-4 py-3">
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
            visible.map((gap, i) => (
              <div
                key={gap.kind}
                className="flex items-baseline gap-3 border-t border-line py-2.5 first:border-t-0"
              >
                <span className="w-[10px] shrink-0 text-[11px] text-fg-subtle crm-num">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <span className="text-[12.5px] font-bold text-fg">{gap.label}</span>
                  <span className="ml-2 text-[11px] text-fg-subtle">{gap.why}</span>
                </div>

                <div className="w-[160px] shrink-0">
                  {gap.needsForm ? (
                    <ContactDialog
                      accountId={accountId}
                      mode="create"
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          className="w-full border-b border-line-strong pb-0.5 text-left text-[12px] font-semibold text-accent hover:border-accent"
                        >
                          add a person
                        </button>
                      )}
                    />
                  ) : editing === gap.kind ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(gap.kind);
                      }}
                    >
                      <input
                        autoFocus
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditing(null);
                            setValue("");
                          }
                        }}
                        onBlur={() => {
                          if (!value.trim()) setEditing(null);
                        }}
                        disabled={pending}
                        placeholder={gap.placeholder ?? ""}
                        aria-label={gap.label}
                        className="w-full border-b border-accent bg-transparent pb-0.5 text-[12px] text-fg outline-none placeholder:text-fg-subtle disabled:opacity-60"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(gap.kind);
                        setValue("");
                        setError(null);
                      }}
                      className="w-full border-b border-line-strong pb-0.5 text-left text-[12px] text-fg-subtle transition-colors hover:border-accent hover:text-accent"
                    >
                      {gap.placeholder}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
