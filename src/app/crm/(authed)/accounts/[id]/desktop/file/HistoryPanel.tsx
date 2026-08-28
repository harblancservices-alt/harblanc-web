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
 * ── WHERE THE EVENT TRAIL WENT (nowhere — it is one click away) ───────
 *
 * Not deleted. Not filtered out of the database. `crm_activities` is the
 * accountability record and every row of it is still there; this is a
 * display decision and nothing else. "full history · N" opens the events
 * back up IN PLACE, under the written entries, and the count in that
 * control has always been — and still is — the count of EVERYTHING.
 *
 * It opens in place rather than navigating because the link it used to
 * carry, /crm/accounts/[id]/history, was pointing at a route that does not
 * exist and never has. A dead link is a bad home for an audit trail.
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
  if (sameDay) return `Today ${time}`;
  if (nowMs - t < 2 * DAY_MS) return `Yesterday ${time}`;
  return day;
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
  if (item.type === "call") return item.tag ? `call · ${item.tag.toLowerCase()}` : "call";
  if (item.type === "note") return "note";
  return "";
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
  const [showEvents, setShowEvents] = useState(false);

  const written = items.filter((i) => i.type === "call" || i.type === "note");
  const events = items.filter((i) => i.type === "activity");

  return (
    <FileCard className="flex flex-col">
      <SectionHead
        title="Notes & what happened"
        action={
          items.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowEvents((v) => !v)}
              aria-expanded={showEvents}
              className="rounded text-[12px] text-fg-subtle transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {showEvents ? "notes & calls only" : `full history · ${items.length}`}
            </button>
          ) : null
        }
      />

      <div className="flex-1 px-4 py-3">
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
        {items.length > 0 && written.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] font-bold text-fg">No notes or calls yet</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-[12px] text-fg-subtle">
              Log the first call above and it will land here.
              {events.length > 0 && !showEvents && (
                <>
                  {" "}
                  {events.length} automatic {events.length === 1 ? "record is" : "records are"} in
                  full history.
                </>
              )}
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
          {written.map((item, i) => {
            const newest = i === 0;
            const desc = descriptor(item);
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
                  <p className="min-w-0 text-[12px]">
                    <span className="font-bold text-fg">{stamp(item.occurredAt, nowMs)}</span>
                    {desc && <span className="font-semibold text-fg-muted"> · {desc}</span>}
                    {item.author && <span className="text-fg-subtle"> · {item.author}</span>}
                    {item.editedAt && (
                      /* History that can be quietly rewritten is not history.
                         A corrected write-up says so. */
                      <span className="ml-1.5 text-[10.5px] font-semibold italic text-fg-subtle">
                        edited
                      </span>
                    )}
                    {item.isPinned && (
                      <span className="ml-1.5 rounded-[3px] border border-warn/40 bg-warn-bg px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.06em] text-warn">
                        Pinned
                      </span>
                    )}
                  </p>

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
                  item.body && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-fg-muted">
                      {item.body}
                    </p>
                  )
                )}
              </article>
            );
          })}
        </div>

        {/* ── WHAT THE SYSTEM RECORDED: asked for, never volunteered ──
            Same one-line, date-only, greyed treatment it always had — the
            difference between "somebody wrote this" and "the record
            changed" should be obvious without reading a word of it. The
            only change is that you now have to ask. */}
        {showEvents && events.length > 0 && (
          <div
            className={`flex flex-col gap-1 ${
              written.length > 0 ? "mt-3 border-t border-line pt-2.5" : ""
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              Automatic record
            </p>
            {events.map((e) => (
              <p key={e.id} className="flex items-baseline gap-2.5 text-[11px] text-fg-subtle">
                {/* shrink-0 with no fixed width: the old w-[88px] could not
                    hold a long stamp and the text ran straight over it. */}
                <span className="shrink-0 whitespace-nowrap crm-num">
                  {shortStamp(e.occurredAt)}
                </span>
                <span className="min-w-0 flex-1">
                  {e.title}
                  {e.body ? ` — ${e.body}` : ""}
                  {e.author ? ` · ${e.author}` : ""}
                </span>
              </p>
            ))}
          </div>
        )}
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
