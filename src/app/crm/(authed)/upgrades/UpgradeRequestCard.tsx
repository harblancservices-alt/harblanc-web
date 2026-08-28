"use client";

import { useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { formatDateTime } from "../_shell/format";
import { deleteUpgradeRequest, updateUpgradeStatus } from "./actions";
import { statusStyle, type UpgradeStatus } from "./status";
import { Modal } from "../_shell/Modal";
import { BTN_SUCCESS, BTN_EDIT, BTN_DANGER, BTN_NEUTRAL } from "../_shell/ui";
import { IconCheck, IconTrash } from "../_shell/icons";

export type CrmUpgradeAttachment = {
  id: string;
  fileName: string;
  /** Resolved server-side (the bucket is private) — null if signing failed,
   * in which case the tile falls back to a filename chip instead of an img. */
  signedUrl: string | null;
};

export type CrmUpgradeRequest = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  createdAt: string;
  authorName: string;
  isMine: boolean;
  /** null on rows completed before completed_at existed — see the migration. */
  completedAt: string | null;
  completedByName: string | null;
  completionNote: string | null;
  attachments: CrmUpgradeAttachment[];
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a, button, select, input, textarea"))
    : false;
}

/**
 * One card on the Upgrades board.
 *
 * The redesign is mostly about what the card REFUSES to do. It never removes
 * itself: a request that gets completed turns green and stays put, because
 * the reporter's actual question is "did anyone fix this?" and a card that
 * vanishes answers it wrong. Completion carries its evidence with it — when,
 * by whom, and what they did — so the answer is on the card rather than in
 * somebody's memory.
 *
 * "Done" no longer doubles as the disappear button either. Completing and
 * deleting are separate controls saying separate things, and delete asks
 * first.
 */
export function UpgradeRequestCard({
  request,
  canEditStatus,
}: {
  request: CrmUpgradeRequest;
  canEditStatus: boolean;
}) {
  const [status, setStatus] = useState(request.status);
  const [lightbox, setLightbox] = useState<CrmUpgradeAttachment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = statusStyle(status);
  const isCompleted = status === "completed";
  const canDelete = request.isMine || canEditStatus;

  function move(next: UpgradeStatus, completionNote?: string) {
    const prev = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await updateUpgradeStatus(request.id, next, completionNote ?? null);
      if (!res.ok) {
        setStatus(prev);
        setError(res.error);
      } else {
        setCompleting(false);
        setNote("");
      }
    });
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    const res = await deleteUpgradeRequest(request.id);
    if (!res.ok) {
      setRemoving(false);
      setError(res.error);
      setConfirmDelete(false);
      return;
    }
    // The row is gone; the page revalidates it away. Leave `removing` on so
    // the controls stay disabled during the swap rather than flicking back
    // to live for a frame.
    setConfirmDelete(false);
  }

  function openDetail(e: ReactMouseEvent<HTMLLIElement>) {
    if (isInteractiveTarget(e.target)) return;
    setDetailOpen(true);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLLIElement>) {
    if (isInteractiveTarget(e.target)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      setDetailOpen(true);
    }
  }

  const statusPill = (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );

  /** Owner-only lifecycle controls. Start and Complete are separate moves so
   * the board can show what is actually being worked on right now. */
  const ownerActions = canEditStatus ? (
    <>
      {status === "open" && (
        <button
          type="button"
          disabled={pending || removing}
          onClick={() => move("in_progress")}
          className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
        >
          Start
        </button>
      )}
      {!isCompleted && (
        <button
          type="button"
          disabled={pending || removing}
          onClick={() => setCompleting(true)}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
        >
          <IconCheck width={14} height={14} />
          Complete
        </button>
      )}
      {isCompleted && (
        <button
          type="button"
          disabled={pending || removing}
          onClick={() => move("open")}
          className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
        >
          Reopen
        </button>
      )}
    </>
  ) : null;

  const shots = request.attachments.length;

  /** The completion banner — the thing that answers "did anyone fix this?" */
  const completionBlock = isCompleted ? (
    <div className="rounded-md border border-ok/30 bg-ok-bg px-2.5 py-2">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-ok">
        <IconCheck width={13} height={13} />
        Completed
        {request.completedAt ? (
          <span className="font-semibold">· {formatDateTime(request.completedAt)}</span>
        ) : (
          // Honest about the four rows that were finished before the CRM
          // started recording when. Better than a date nobody wrote down.
          <span className="font-normal text-ok/80">· date not recorded</span>
        )}
        {request.completedByName && (
          <span className="font-normal text-ok/80">by {request.completedByName}</span>
        )}
      </p>
      {request.completionNote && (
        <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-muted">
          {request.completionNote}
        </p>
      )}
    </div>
  ) : null;

  function thumbs(size: string) {
    return (
      <div className="flex flex-wrap gap-2">
        {request.attachments.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => a.signedUrl && setLightbox(a)}
            className={`${size} overflow-hidden rounded-lg border border-line-strong bg-inset`}
          >
            {a.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.signedUrl}
                alt={a.fileName}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center px-1 text-center text-[9px] text-fg-subtle">
                {a.fileName}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <li
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={onKeyDown}
      className="flex cursor-pointer flex-col gap-2.5 px-5 py-4 outline-none transition-colors hover:bg-fg/[0.03] focus-visible:bg-fg/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-fg">{request.title}</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            {request.isMine ? "You" : request.authorName} · {formatDateTime(request.createdAt)}
            {shots > 0 && (
              <>
                {" · "}
                {shots} screenshot{shots === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {statusPill}
          {ownerActions}
          {canDelete && (
            <button
              type="button"
              disabled={pending || removing}
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this request"
              title="Delete this request"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-bad/70 transition-colors hover:bg-bad-bg hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad/40 disabled:opacity-40"
            >
              <IconTrash width={15} height={15} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}

      {completionBlock}

      {request.body && (
        <p className="line-clamp-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-muted">
          {request.body}
        </p>
      )}

      {shots > 0 && thumbs("h-16 w-16")}

      <div>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="text-[12px] font-bold text-accent transition-colors hover:underline"
        >
          View details
        </button>
      </div>

      {lightbox?.signedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox(null);
          }}
          role="presentation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.signedUrl}
            alt={lightbox.fileName}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      {/* Wrapper stops clicks anywhere inside a modal (including its own
          backdrop-dismiss) from bubbling back up to this <li>'s openDetail
          handler — without it, dismissing would immediately reopen it. */}
      <div onClick={(e) => e.stopPropagation()}>
        <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={request.title}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-fg-subtle">
                {request.isMine ? "You" : request.authorName} · {formatDateTime(request.createdAt)}
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {statusPill}
                {ownerActions}
              </div>
            </div>

            <p className="text-[12px] text-fg-subtle">{style.meaning}</p>

            {error && <p className="text-[12.5px] text-bad">{error}</p>}

            {completionBlock}

            {request.body ? (
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-muted">
                {request.body}
              </p>
            ) : (
              <p className="text-[13px] italic text-fg-subtle">No additional details.</p>
            )}

            {shots > 0 ? (
              thumbs("h-20 w-20")
            ) : (
              <p className="text-[13px] italic text-fg-subtle">No screenshots attached.</p>
            )}
          </div>
        </Modal>

        {/* Completing asks for a note. It is optional — a required field
            would just get "fixed" typed into it — but this is the one place
            the reporter finds out WHAT was done. */}
        <Modal
          open={completing}
          onClose={() => !pending && setCompleting(false)}
          busy={pending}
          title="Mark completed"
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Completing <span className="font-semibold">{request.title}</span>. Add a note so{" "}
            {request.isMine ? "you" : request.authorName} can see what changed.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Fixed the customer phone field not saving. Deployed in today's release."
            className="mt-3 w-full resize-y rounded-md border border-line-strong bg-card px-2.5 py-2 text-[13px] leading-snug text-fg outline-none focus:border-accent"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCompleting(false)}
              disabled={pending}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => move("completed", note)}
              disabled={pending}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_SUCCESS}`}
            >
              {pending ? "Saving…" : "Mark completed"}
            </button>
          </div>
        </Modal>

        <Modal
          open={confirmDelete}
          onClose={() => !removing && setConfirmDelete(false)}
          busy={removing}
          title="Delete upgrade request"
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{request.title}</span>? This permanently removes
            the issue
            {shots > 0 && (
              <>
                {" "}
                and its {shots} screenshot{shots === 1 ? "" : "s"}
              </>
            )}
            .
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
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
      </div>
    </li>
  );
}
