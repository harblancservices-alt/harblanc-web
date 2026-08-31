"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fillCompanyGap } from "../../details-actions";
import { acceptGuess, dismissGuess } from "../../research-actions";
import { ContactDialog } from "../../ContactDialog";
import { GapChipInput } from "../../../../_shell/gapChip";
import type { FileGap } from "./fileGaps";
import type { ResearchGuess } from "./researchGuesses";
import type { Lookup } from "./lookups";

/**
 * FIND THIS OUT BEFORE YOU CALL — the research column.
 *
 * Replaces the empty document viewer on a company with no bill of lading.
 * On a company that HAS one, this never renders and the document keeps the
 * space; see WhatWeKnow.
 *
 * ── LOUD WHEN EMPTY, QUIET WHEN DONE ──────────────────────────────────
 *
 * The single rule the design turns on. A company nobody has researched used
 * to look exactly like one that is ready to call — both a wall of grey. So
 * the header here is BLUE and counts the work while anything is missing,
 * and turns GREEN and says "Ready to call" when nothing is left to look up.
 * That contrast is the feature. If a later pass tones it down to match the
 * rest of the page, the panel stops telling anybody anything.
 *
 * ── EVERY WORD IS WRITTEN FOR SOMEBODY'S FIRST WEEK ───────────────────
 *
 * Charia started on 2026-08-30 and will open this at 9pm with nobody to
 * ask. So each field says WHY it matters in a sentence (fileGaps.ts's
 * `why`, reworded on the same date for exactly this reason), each lookup
 * says what it is FOR rather than what it is called, and the ask-for script
 * is printed rather than assumed. "Are they a shipper" means nothing on day
 * one; "do they move goods out of a building" does.
 *
 * ── OFFERS, NEVER WRITES ──────────────────────────────────────────────
 *
 * A guess renders as a question with Yes and No. Nothing reaches the record
 * without somebody pressing Yes, and a No is remembered so the same
 * suggestion never comes back. See research-actions.ts.
 */

export function ResearchColumn({
  accountId,
  companyName,
  gaps,
  guesses,
  lookups,
  /** The finished record we point a new hire at. Null when the org has
   * none complete enough to be worth copying. */
  exemplar,
  /** Anything the calls have already established — printed so picking a
   * half-worked company back up does not mean reading the whole history. */
  lastCallNote,
}: {
  accountId: string;
  companyName: string;
  gaps: FileGap[];
  guesses: ResearchGuess[];
  lookups: Lookup[];
  exemplar: { id: string; name: string; line: string } | null;
  lastCallNote: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Guesses answered in THIS render, so the row goes immediately rather
   * than waiting on the refresh. The server is the real record. */
  const [answered, setAnswered] = useState<Record<string, "yes" | "no">>({});
  /** Gaps filled in this render, same reason. */
  const [filled, setFilled] = useState<Set<string>>(new Set());

  const openGuesses = guesses.filter((g) => !answered[g.field]);
  const openGaps = gaps.filter((g) => !filled.has(g.kind));
  /** A guess for a field IS the answer to that field's gap, so showing both
   * would ask the same question twice in one column. */
  const guessFields = new Set(openGuesses.map((g) => g.field));
  const asks = openGaps.filter(
    (g) => !(guessFields.has(g.kind as never) || (g.kind === "contact" && guessFields.has("contact"))),
  );

  const outstanding = openGuesses.length + asks.length;
  const ready = outstanding === 0;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "That did not save.");
        return;
      }
      after();
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col bg-inset">
      {/* ══ THE STATE OF THE RECORD, in colour and in words ══ */}
      <div className={`px-4 py-3 ${ready ? "bg-ok" : "bg-accent"}`}>
        <p className="text-[15px] font-bold text-white">
          {ready ? "✓ Ready to call" : "Find this out before you call"}
        </p>
        <p className="mt-0.5 text-[12.5px] font-semibold text-white/95">
          {ready
            ? "Nothing left to look up."
            : `${outstanding} ${outstanding === 1 ? "thing" : "things"} missing. Takes about two minutes.`}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-3">
        {error && (
          <p className="mb-2 rounded-md border border-bad/40 bg-bad-bg px-2.5 py-1.5 text-[12px] font-bold text-bad">
            {error}
          </p>
        )}

        {/* ══ WHERE TO LOOK. The part that teaches. ══ */}
        {lookups.length > 0 && (
          <div className="pb-3">
            <p className="mb-1.5 text-[12.5px] font-bold text-fg">
              Look them up — opens a new tab, already filled in:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lookups.map((l) => (
                <a
                  key={l.key}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={l.hint}
                  className="inline-flex items-center gap-1.5 rounded-md border-2 border-accent bg-card px-2.5 py-1.5 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent-bg"
                >
                  <span aria-hidden>{l.glyph}</span>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ══ WHAT THE APP THINKS IT KNOWS — offered, never written ══ */}
        {openGuesses.map((g) => (
          <div key={`guess-${g.field}`} className="border-t border-line py-3">
            <p className="text-[14px] font-bold text-fg">{GUESS_LABEL[g.field]}</p>
            <div className="mt-2 rounded-md border-2 border-admin bg-admin-soft px-3 py-2.5">
              <p className="text-[13px] leading-snug text-fg">
                <span className="font-bold">{g.value}</span>
                {g.email && <span className="font-bold"> · {g.email}</span>}
                <span className="block text-fg-muted">{g.basis}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.field === "contact" ? (
                  /* A PERSON IS NEVER WRITTEN FROM A GUESS. The dialog opens
                     with the name and email filled in and somebody completes
                     it — a contact is a name, a title, a number and an
                     email, and half of one made silently is a bad record
                     that looks like a good one. */
                  <ContactDialog
                    accountId={accountId}
                    companyName={companyName}
                    mode="create"
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        className="rounded-md border-2 border-ok bg-ok px-3 py-1 text-[12.5px] font-bold text-white transition-colors hover:opacity-90"
                      >
                        Yes, add them
                      </button>
                    )}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          acceptGuess({
                            accountId,
                            field: g.field,
                            value: g.value,
                            basis: g.basis,
                          }),
                        () => setAnswered((p) => ({ ...p, [g.field]: "yes" })),
                      )
                    }
                    className="rounded-md border-2 border-ok bg-ok px-3 py-1 text-[12.5px] font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    Yes, use that
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => dismissGuess({ accountId, field: g.field }),
                      () => setAnswered((p) => ({ ...p, [g.field]: "no" })),
                    )
                  }
                  className="rounded-md border-2 border-line-strong bg-card px-3 py-1 text-[12.5px] font-bold text-fg transition-colors hover:bg-inset disabled:opacity-50"
                >
                  No
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* ══ WHAT NOBODY CAN ANSWER FOR YOU ══ */}
        {asks.map((gap) => (
          <div key={`gap-${gap.kind}`} className="border-t border-line py-3">
            <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-fg">
              {gap.label}
              {gap.blocking && (
                <span className="rounded bg-bad px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white">
                  stops you
                </span>
              )}
            </p>
            {/* THE SENTENCE THAT MAKES IT MAKE SENSE. Never a label alone. */}
            <p className="mt-1 text-[12.5px] leading-snug text-fg-muted">{gap.why}</p>

            {gap.needsForm ? (
              <ContactDialog
                accountId={accountId}
                companyName={companyName}
                mode="create"
                trigger={(open) => (
                  <button
                    type="button"
                    onClick={open}
                    className="mt-2 rounded-md border-2 border-accent bg-card px-3 py-1.5 text-[12.5px] font-bold text-accent transition-colors hover:bg-accent-bg"
                  >
                    Add the person
                  </button>
                )}
              />
            ) : editing === gap.kind ? (
              <div className="mt-2">
                <GapChipInput
                  value={value}
                  onChange={setValue}
                  onSubmit={() =>
                    run(
                      () => fillCompanyGap(accountId, gap.kind, value.trim()),
                      () => {
                        setFilled((p) => new Set(p).add(gap.kind));
                        setEditing(null);
                        setValue("");
                      },
                    )
                  }
                  onCancel={() => {
                    setEditing(null);
                    setValue("");
                  }}
                  placeholder={gap.placeholder ?? ""}
                  ariaLabel={gap.label}
                  pending={pending}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditing(gap.kind);
                  setValue("");
                  setError(null);
                }}
                className="mt-2 w-full rounded-md border-2 border-dashed border-line-strong bg-card px-3 py-2 text-left text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-accent hover:text-accent"
              >
                {gap.placeholder ? `${gap.placeholder} — type it here` : "Type it here"}
              </button>
            )}

            {/* The one thing that turns a wasted call into a name. Seven
                calls in this org ended at the wrong desk. */}
            {gap.kind === "contact" && (
              <div className="mt-2 rounded-r-md border-l-4 border-warn bg-warn-bg px-3 py-2">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-warn">
                  Say this when they answer
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-fg">
                  “Hi — who schedules your outbound freight?” Then ask for that person by name.
                  Don’t ask for the owner or purchasing; it sends you to the wrong desk.
                </p>
              </div>
            )}
          </div>
        ))}

        {/* ══ WHERE YOU GOT TO LAST TIME ══ */}
        {lastCallNote && (
          <div className="mt-3 rounded-r-md border-l-4 border-warn bg-warn-bg px-3 py-2">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-warn">
              Where you got to last time
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-snug text-fg">
              {lastCallNote}
            </p>
          </div>
        )}

        {/* ══ WHAT DONE LOOKS LIKE — only while there is still work ══ */}
        {!ready && exemplar && (
          <div className="mt-3 rounded-md border-2 border-dashed border-line-strong bg-card px-3 py-2.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg">
              What a finished one looks like
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-fg">{exemplar.line}</p>
            <a
              href={`/crm/accounts/${exemplar.id}`}
              className="mt-1.5 inline-block text-[12.5px] font-bold text-accent hover:underline"
            >
              Open {exemplar.name} →
            </a>
          </div>
        )}

        {ready && (
          <p className="border-t border-line pt-3 text-[13px] leading-snug text-fg">
            Everything this record asks for is filled in. What is left —{" "}
            <span className="font-bold">who moves their freight today</span>, and{" "}
            <span className="font-bold">how often and where to</span> — only they can tell you.
          </p>
        )}
      </div>
    </div>
  );
}

/** The question each guess is answering, in the agent's words. */
const GUESS_LABEL: Record<string, string> = {
  industry: "What they make or sell",
  phone: "A number to ring",
  website: "Their website",
  contact: "Somebody to call",
};
