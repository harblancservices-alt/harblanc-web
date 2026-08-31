"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CrmActivityLogItem } from "../../ActivityLogSection";
import { deleteNote, updateNote, setNotePinned } from "../../../actions";
import { deleteCall, updateCall } from "../../../../calls/actions";
import { Modal } from "../../../../_shell/Modal";
import { BTN_DANGER, BTN_NEUTRAL, DeleteIconButton } from "../../../../_shell/ui";
import { FileCard, SectionHead } from "./chrome";

/**
 * PANEL 02 — NOTES & WHAT HAPPENED.
 *
 * The record of the relationship, newest first, with the most recent entry
 * given real weight and everything older set quietly beneath it.
 *
 * ── WHAT THIS PANEL IS FOR ────────────────────────────────────────────
 *
 * One question: WHAT DID A PERSON SAY, AND WHEN. Somebody rang this
 * company, wrote down what was said, and the next person to pick it up
 * needs that sentence before anything else on the page.
 *
 * So the panel shows calls and notes and nothing else. It used to also
 * carry the automatic event trail — "Company details updated", "Location
 * added", "Stage changed", "Linked as shipper on a BOL" — and on a company
 * nobody had called yet that trail was the ENTIRE contents of a panel
 * titled "Notes & what happened": six rows of button-presses under a
 * heading promising the opposite. Brent, 2026-08-27: the notes area shows
 * what a person wrote or logged.
 *
 * ── WHERE THE EVENT TRAIL IS (on screen, quieter) ────────────────────
 *
 * There was a "full history · N" toggle here. Brent, 2026-08-28: "That full
 * history needs to be displayed in card form and not under the button.
 * Delete the button." So everything renders inline, newest first, in one
 * stream.
 *
 * That is NOT a reversal of the split above — he still does not want the
 * button-press log burying the writing. The split is expressed as WEIGHT
 * now instead of as a control: a call or a note is a full bordered card
 * with its write-up and its Edit/Pin/Delete controls; a stage change or a
 * contact edit is a single grey line with a date. Both are visible, and the
 * writing still wins the page without anything being hidden to achieve it.
 *
 * Nothing counts what is hidden any more, because nothing is.
 *
 * ── WHERE THE LINE FALLS, AND WHY IT IS NOT "DID A HUMAN DO IT" ───────
 *
 * Every row in that trail was caused by a person: Brent moved the stage,
 * Brent added the contact, Brent created the company. "Human-caused" does
 * not separate them, so it is the wrong test.
 *
 * The test that works: DOES IT TELL THE NEXT CALLER SOMETHING THEY CANNOT
 * ALREADY SEE? A note carries what was said. A stage change carries a
 * status that is displayed in the stage strip at the top of this very
 * page — reading it here adds nothing, and it can take the newest-entry
 * slot, which is the one thing this panel exists to surface. If the top
 * entry should be the sentence you would want read aloud before the phone
 * rings, a stage change never wins that slot.
 *
 * So stage changes stay in the event trail with the rest. They are
 * provenance, and provenance has a home.
 *
 * ── DATES ─────────────────────────────────────────────────────────────
 *
 * `nowMs` is threaded in from the page rather than read here. The React
 * Compiler's purity rule forbids Date.now() during render, and beyond the
 * rule it is the right thing: every relative label on this page is measured
 * against ONE instant, so two entries can never disagree about what "today"
 * means. See lib/crm/serverNow.ts.
 */

const DAY_MS = 86_400_000;

/** "Today 1:15 PM" for something from today, "Aug 22" for anything older —
 * the design's own two forms. */
function stamp(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const time = new Date(t).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
  const day = new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
  const sameDay =
    new Date(t).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) ===
    new Date(nowMs).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  if (sameDay) return `Today · ${time}`;
  if (nowMs - t < 2 * DAY_MS) return `Yesterday · ${time}`;
  /* THE TIME NO LONGER FALLS OFF. This returned a bare "Aug 22" for
     anything older than two days, so the panel whose one job is "when did
     we last speak to these people" stopped saying WHEN as soon as the call
     was three days old. */
  return `${day} · ${time}`;
}

/** "4d ago". Absolute answers when; this answers whether it is stale. */
function ago(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((nowMs - t) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 45) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/**
 * WHAT A SYSTEM EVENT IS, drawn as itself.
 *
 * Every one of these arrived as `type: "activity"` plus a summary string
 * until 2026-08-31, so a stage change and a contact edit rendered as the
 * same grey line. The raw kind now comes through (see page.tsx) and each
 * family gets its own label and its own dot — the SAME colours the Activity
 * dashboard uses for the same events, so the two surfaces agree.
 */
const EVENT_STYLE: Record<string, { label: string; dot: string }> = {
  lifecycle_changed: { label: "Stage", dot: "bg-admin" },
  account_created: { label: "Company created", dot: "bg-line-strong" },
  account_deleted: { label: "Company removed", dot: "bg-line-strong" },
  contact_added: { label: "Contact added", dot: "bg-warn" },
  contact_updated: { label: "Contact edited", dot: "bg-warn" },
  contact_deleted: { label: "Contact removed", dot: "bg-warn" },
  task_created: { label: "Task added", dot: "bg-ok" },
  task_completed: { label: "Task done", dot: "bg-ok" },
  task_reopened: { label: "Task reopened", dot: "bg-ok" },
  rep_changed: { label: "Owner changed", dot: "bg-line-strong" },
  details_updated: { label: "Details edited", dot: "bg-line-strong" },
  location_added: { label: "Location added", dot: "bg-line-strong" },
  location_updated: { label: "Location edited", dot: "bg-line-strong" },
  location_deleted: { label: "Location removed", dot: "bg-line-strong" },
  bol_created: { label: "Bill of lading added", dot: "bg-steel" },
  bol_generated: { label: "Bill of lading made", dot: "bg-steel" },
  bol_deleted: { label: "Bill of lading removed", dot: "bg-steel" },
  ai_lead_claimed: { label: "Lead claimed", dot: "bg-line-strong" },
  ai_lead_released: { label: "Lead released", dot: "bg-line-strong" },
  ai_research_requested: { label: "Research requested", dot: "bg-line-strong" },
};

/** The summary with its label prefix removed — the label is drawn
 * separately now, so "Task added: Follow up with Jeff" would say it twice. */
function eventDetail(item: CrmActivityLogItem, label: string | null): string {
  const raw = (item.title ?? "").trim();
  const cut = raw.indexOf(":");
  const rest = cut > -1 ? raw.slice(cut + 1).trim() : raw;
  /* Summaries that carry no colon ARE the label in sentence form —
     "Company created", "AI research requested for repurposed Materials".
     Printing them beside the label says the same thing twice, and the
     second half also names the company whose page you are already on. */
  if (label && rest.toLowerCase().includes(label.toLowerCase())) return "";
  return rest;
}

/**
 * Date only, no time — for the system events.
 *
 * They get a different form from the written entries on purpose. "Yesterday
 * 1:35 PM" in a one-line row is both longer than the row can hold (it was
 * overlapping the text beside it) and more precision than a system event
 * deserves: nobody needs the minute the record was created. The written
 * entries keep the full stamp because when somebody was spoken to is the
 * whole point of the panel.
 */
function shortStamp(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
}

/** The middle segment of an entry's header — "call · reached", "note". */
function descriptor(item: CrmActivityLogItem): string {
  if (item.type === "call") return "Call";
  if (item.type === "note") return "Note";
  return "";
}

/** Call = accent, note = quiet. The same two colours the Activity dashboard
 * gives these, so an agent learns one mapping and not two. */
function chipTone(item: CrmActivityLogItem): string {
  return item.type === "call" ? "bg-accent-bg text-accent" : "bg-inset text-fg-muted";
}

/** How the call went, if anybody said. `tag` is the display form and
 * `outcome` the raw column; either answers "did we reach them". */
function outcomeOf(item: CrmActivityLogItem): string | null {
  if (item.type !== "call") return null;
  const raw = (item.tag ?? item.outcome ?? "").trim().replace(/_/g, " ");
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : null;
}

export function HistoryPanel({
  accountId,
  items,
  nowMs,
}: {
  accountId: string;
  items: CrmActivityLogItem[];
  nowMs: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** The note being edited in place, and the row awaiting a delete
   * confirmation. Held as the ITEM, not an id, so the dialog can name what
   * it is about to remove. */
  const [editing, setEditing] = useState<CrmActivityLogItem | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<CrmActivityLogItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That did not save.");
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  async function remove() {
    if (!confirming) return;
    setRemoving(true);
    setError(null);
    const res =
      confirming.type === "note"
        ? await deleteNote(confirming.id, accountId)
        : await deleteCall(confirming.id, accountId);
    setRemoving(false);
    if (!res.ok) {
      setError(res.error);
      setConfirming(null);
      return;
    }
    setConfirming(null);
    router.refresh();
  }
  /* The audit trail is closed by default and stays where it is put — this
     is a reading preference, not a filter on the data. */
  /* ONE STREAM, NEWEST FIRST. Brent, 2026-08-28: "That full history needs to
     be displayed in card form and not under the button. Delete the button."
     `items` already arrives sorted desc from page.tsx, so nothing re-sorts
     here -- the panel shows what it is given, in the order it is given.

     The written/events SPLIT still exists, because the reason it was created
     has not gone away: he asked for system rows out of the notes area
     because they logged every button pressed and buried the writing. The
     split is now expressed as WEIGHT rather than as a toggle -- a call is a
     full card, a stage change is a quiet line -- so everything is visible
     and the writing still wins the page. */
  const written = items.filter((i) => i.type === "call" || i.type === "note");

  return (
    <FileCard className="flex min-h-0 flex-col">
      <SectionHead title="Notes & what happened" />

      {/* THE BODY SCROLLS, the card does not grow. With the toggle gone the
          audit trail is always on screen, and one company in production
          carries 119 of them -- 16,000px of panel if this were left to size
          to its content, which would stretch Who do I call and Tasks beside
          it to match and push the whole row off the screen.

          min-h-0 + overflow-auto is the same chain the Shipments panel
          already uses. Everything stays rendered and reachable by scrolling
          INSIDE the card; nothing is hidden, which is the whole point of
          deleting the button. */}
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {/* NOTHING AT ALL — no calls, no notes, no events. */}
        {items.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] font-bold text-fg">Nothing has happened yet</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-[12px] text-fg-subtle">
              Log the first call above and it will land here.
            </p>
          </div>
        )}

        {/* NOBODY HAS CALLED YET, but the record is not empty. Say so
            plainly rather than showing a blank panel — and say where the
            other N things went, so the count in the header is not a
            mystery. */}
        {/* NOBODY HAS WRITTEN ANYTHING, but the record is not empty. The
            automatic rows below say what the system did; this says what a
            person has not done yet, which is the more useful gap. No count
            of what is hidden any more — nothing is hidden. */}
        {items.length > 0 && written.length === 0 && (
          <div className="pb-3 text-center">
            <p className="text-[13px] font-bold text-fg">No notes or calls yet</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-[12px] text-fg-subtle">
              Log the first call above and it will land here.
            </p>
          </div>
        )}

        {/* ── WHAT A PERSON DID: one card each ──────────────────────
            Every written entry is its own bordered card with the timestamp
            leading its header, because the panel's job is "when did we last
            speak to these people and what was said". A flat list of rows
            with the date in a narrow gutter buried that — the date was the
            smallest thing on a line it was supposed to organise. */}
        <div className="flex flex-col gap-2.5">
          {items.map((item) => {
            /* A SYSTEM ROW IS A MARGIN NOTE, not a card. Same stream, same
               order, a fraction of the weight: date, one line, grey. It
               should read as something that happened TO the record beside
               what somebody did about it. */
            if (item.type === "activity") {
              const ev = EVENT_STYLE[item.eventKind ?? ""] ?? null;
              const detail = ev ? eventDetail(item, ev.label) : (item.title ?? "");
              const isStage = item.stageFrom != null && item.stageTo != null;
              /* Lost and Won are the two moves worth spotting from across
                 the panel. Everything else is a step along the way. */
              const lost = /lost|dead|dnq|disqual/i.test(item.stageTo ?? "");
              const won = /won|customer|closed[- ]won/i.test(item.stageTo ?? "");

              return (
                <div key={item.id} className="flex items-baseline gap-2.5 px-0.5">
                  {/* THE DATE GETS ITS OWN COLUMN. It used to be 11px grey
                      inline, so it wrapped mid-sentence and every row started
                      at a different place. Fixed width + tabular figures makes
                      the whole column readable as a column. */}
                  <span className="crm-num w-[52px] shrink-0 text-right text-[12px] font-bold leading-[1.6] text-fg-muted">
                    {shortStamp(item.occurredAt)}
                  </span>
                  <span
                    aria-hidden
                    className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${ev?.dot ?? "bg-line-strong"}`}
                  />
                  <span className="min-w-0 flex-1 text-[12px] leading-[1.6] text-fg-subtle">
                    {ev && <span className="font-bold text-fg-muted">{ev.label}</span>}
                    {isStage ? (
                      /* FROM → TO, drawn instead of described. "Stage changed:
                         Prospect → Lost" was a sentence you had to read; two
                         chips and an arrow is a shape you can see. */
                      <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
                        <span className="rounded bg-inset px-1.5 py-px text-[11px] font-semibold text-fg-muted">
                          {item.stageFrom}
                        </span>
                        <span aria-hidden className="text-[13px] font-bold text-fg-muted">
                          &rarr;
                        </span>
                        <span
                          className={`rounded px-1.5 py-px text-[11px] font-bold ${
                            lost
                              ? "bg-bad-bg text-bad"
                              : won
                                ? "bg-ok-bg text-ok"
                                : "bg-admin-soft text-admin"
                          }`}
                        >
                          {item.stageTo}
                        </span>
                      </span>
                    ) : (
                      detail && <span className={ev ? "ml-1.5" : ""}>{detail}</span>
                    )}
                    {item.body && <span> &mdash; {item.body}</span>}
                    {item.author && <span className="text-fg-subtle"> &middot; {item.author}</span>}
                  </span>
                </div>
              );
            }

            /* The newest WRITTEN entry is the one you came to read, so the
               lift follows the writing rather than whatever happens to be
               first in the stream — otherwise a stage change at the top
               would wear the accent rule. */
            const newest = item.id === written[0]?.id;
            const desc = descriptor(item);
            const outcome = outcomeOf(item);
            return (
              <article
                key={item.id}
                className={
                  newest
                    ? // The newest is the one you came to read. Tinted ground
                      // and an accent rule instead of a border — it reads as
                      // lifted rather than as one more card in the stack.
                      "border-l-[3px] border-accent bg-inset px-3.5 py-3"
                    : "rounded-md border border-line bg-card px-3.5 py-3"
                }
              >
                <div className="flex items-start justify-between gap-2">
                  {/* THE DATE IS THE HEADLINE, not a fragment of one.
                      It used to be 12px inside a "·"-separated run-on with
                      the type and the author, so the one fact the panel
                      exists to answer — WHEN did this happen — had to be
                      picked out of a sentence. It now gets its own slot at
                      13px bold in tabular figures, with the type as a
                      coloured chip beside it and the relative age after it,
                      so "how stale is this" reads without arithmetic. */}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    {desc && (
                      <span
                        className={`rounded px-1.5 py-px text-[10.5px] font-bold uppercase tracking-[0.06em] ${chipTone(item)}`}
                      >
                        {desc}
                      </span>
                    )}
                    <span className="crm-num text-[13px] font-bold leading-tight text-fg">
                      {stamp(item.occurredAt, nowMs)}
                    </span>
                    <span className="text-[11.5px] font-semibold text-fg-subtle">
                      {ago(item.occurredAt, nowMs)}
                    </span>
                    {item.author && (
                      <span className="text-[11.5px] text-fg-subtle">{item.author}</span>
                    )}
                    {item.editedAt && (
                      /* History that can be quietly rewritten is not history.
                         A corrected write-up says so. */
                      <span className="text-[10.5px] font-semibold italic text-fg-subtle">
                        edited
                      </span>
                    )}
                    {item.isPinned && (
                      <span className="rounded-[3px] border border-warn/40 bg-warn-bg px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.06em] text-warn">
                        Pinned
                      </span>
                    )}
                  </div>

                  {/* WHAT A PERSON WROTE, THEY CAN FIX. Until 2026-08-28 this
                      panel imported no actions at all: a desktop user could
                      add a note through the composer and then never touch it,
                      and a mis-logged call was permanent. The audit trail
                      below stays untouchable on purpose — an automatic record
                      is not somebody's writing to correct. */}
                  <div className="flex shrink-0 items-center gap-1">
                    {item.type === "note" && (
                      <>
                        <button
                          type="button"
                          disabled={pending || removing}
                          onClick={() => run(() => setNotePinned(item.id, accountId, !item.isPinned))}
                          className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                            item.isPinned ? "text-warn hover:bg-warn-bg" : "text-fg-subtle hover:text-warn"
                          }`}
                        >
                          {item.isPinned ? "Unpin" : "Pin"}
                        </button>
                      </>
                    )}
                    {(item.type === "note" || item.type === "call") && (
                      <button
                        type="button"
                        disabled={pending || removing}
                        onClick={() => {
                          setEditing(item);
                          // A call edits its RAW summary; a note edits its body.
                          setDraft((item.type === "call" ? item.editableText : item.body) ?? "");
                          setError(null);
                        }}
                        className="rounded px-1.5 py-0.5 text-[11px] font-bold text-fg-subtle transition-colors hover:text-accent disabled:opacity-40"
                      >
                        Edit
                      </button>
                    )}
                    {(item.type === "note" || item.type === "call") && (
                      <DeleteIconButton
                        label={item.type === "note" ? "this note" : "this call"}
                        onClick={() => setConfirming(item)}
                        disabled={pending || removing}
                      />
                    )}
                  </div>
                </div>

                {editing?.id === item.id ? (
                  <div className="mt-1.5">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-md border border-line-strong bg-card px-2.5 py-2 text-[12.5px] leading-snug text-fg outline-none focus:border-accent"
                    />
                    <div className="mt-1.5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        disabled={pending}
                        className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${BTN_NEUTRAL}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={pending || !draft.trim()}
                        onClick={() =>
                          run(() =>
                            item.type === "call"
                              ? updateCall(item.id, accountId, draft.trim())
                              : updateNote(item.id, accountId, draft.trim()),
                          )
                        }
                        className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        {pending ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {item.body ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-fg-muted">
                        {item.body}
                      </p>
                    ) : (
                      item.type === "call" && (
                        /* SAYS THE WRITE-UP IS MISSING instead of drawing a
                           card that looks complete. 49 of the 67 logged
                           calls in this org — 73% — have no summary, and a
                           silent gap there reads as "nothing was said",
                           which is a different and much worse claim than
                           "nobody wrote it down". */
                        <p className="mt-1.5 text-[12.5px] italic leading-[1.6] text-fg-subtle">
                          No write-up.{" "}
                          <button
                            type="button"
                            disabled={pending || removing}
                            onClick={() => {
                              setEditing(item);
                              setDraft(item.editableText ?? "");
                              setError(null);
                            }}
                            className="font-semibold not-italic text-accent underline underline-offset-2 transition-colors hover:text-accent-hover disabled:opacity-40"
                          >
                            Add one
                          </button>
                        </p>
                      )
                    )}

                    {/* WHAT THE CALL PRODUCED, as facts rather than prose.
                        Who was spoken to, how it went, and whether anything
                        was booked off the back of it — the three questions
                        asked of a call record, none of which the write-up
                        can be relied on to answer. */}
                    {(outcome || item.contactName || item.followupAt || item.hasFollowupTask) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {outcome && (
                          <span className="rounded bg-inset px-1.5 py-0.5 text-[11px] font-bold text-fg-muted">
                            {outcome}
                          </span>
                        )}
                        {item.contactName && (
                          <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[11px] font-semibold text-warn">
                            {item.contactName}
                          </span>
                        )}
                        {item.followupAt && (
                          <span className="crm-num rounded bg-ok-bg px-1.5 py-0.5 text-[11px] font-bold text-ok">
                            Follow up {shortStamp(item.followupAt)}
                          </span>
                        )}
                        {item.hasFollowupTask && !item.followupAt && (
                          <span className="rounded bg-ok-bg px-1.5 py-0.5 text-[11px] font-bold text-ok">
                            Task created
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>

      </div>

      {error && (
        <p className="mx-4 mb-3 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      {/* Names what it is about to remove, and says what survives. The worry
          about deleting a call is losing the record of the conversation, so
          the dialog answers it rather than leaving it to be guessed. */}
      {confirming && (
        <Modal
          open
          onClose={() => !removing && setConfirming(null)}
          busy={removing}
          title={confirming.type === "note" ? "Delete note" : "Delete logged call"}
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete the {confirming.type === "note" ? "note" : "call"} from{" "}
            <span className="font-semibold">{stamp(confirming.occurredAt, nowMs)}</span>
            {confirming.author ? (
              <>
                {" "}
                by <span className="font-semibold">{confirming.author}</span>
              </>
            ) : null}
            ?
          </p>
          {confirming.body && (
            <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-inset px-2.5 py-2 text-[12px] leading-snug text-fg-muted">
              {confirming.body}
            </p>
          )}
          <p className="mt-2 text-[12.5px] text-fg-muted">
            It comes off the company&rsquo;s history straight away. The automatic
            record that it happened is kept.
          </p>
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
              {removing ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </FileCard>
  );
}
