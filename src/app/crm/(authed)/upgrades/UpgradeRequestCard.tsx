"use client";

import { useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { formatDateTime } from "../_shell/format";
import { updateUpgradeStatus } from "./actions";
import { type UpgradeStatus } from "./status";
import { Modal } from "../_shell/Modal";
import { BTN_SUCCESS, BTN_EDIT } from "../_shell/ui";
import { IconCheck } from "../_shell/icons";

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
  attachments: CrmUpgradeAttachment[];
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_review: "In review",
  done: "Done",
};

const STATUS_TONE: Record<string, string> = {
  new: "border-bad/30 bg-bad-bg text-bad",
  in_review: "border-warn/40 bg-warn/10 text-warn",
  done: "border-ok/40 bg-ok/10 text-ok",
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a, button, select, input, textarea"))
    : false;
}

/**
 * One row in the Upgrades feed. The whole row is clickable — opens a detail
 * view (title, full body, full-size attachments) — except for its nested
 * interactive controls (thumbnails, the status action button), same
 * click-passthrough convention as ClickableRow/ClickableListItem. A visible
 * status pill always shows the current state; a real "Mark done"/"Reopen"
 * button (owner-only — the permission boundary lives server-side in
 * updateUpgradeStatus, this is just which control the page hands the user)
 * replaces the old status <select>, so triaging a request is a single click
 * instead of an awkward dropdown.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDone = status === "done";

  function setDoneState(next: UpgradeStatus) {
    const prev = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await updateUpgradeStatus(request.id, next);
      if (!res.ok) {
        setStatus(prev);
        setError(res.error);
      }
    });
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
      className={`shrink-0 border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
        STATUS_TONE[status] ?? STATUS_TONE.new
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );

  const statusAction = canEditStatus ? (
    isDone ? (
      <button
        type="button"
        disabled={pending}
        onClick={() => setDoneState("new")}
        className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_EDIT}`}
      >
        Reopen
      </button>
    ) : (
      <button
        type="button"
        disabled={pending}
        onClick={() => setDoneState("done")}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-60 ${BTN_SUCCESS}`}
      >
        <IconCheck width={14} height={14} />
        Mark done
      </button>
    )
  ) : null;

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
            {request.authorName} · {formatDateTime(request.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {statusPill}
          {statusAction}
        </div>
      </div>

      {error && <p className="text-[12px] text-bad">{error}</p>}

      {request.body && (
        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-muted">
          {request.body}
        </p>
      )}

      {request.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {request.attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => a.signedUrl && setLightbox(a)}
              className="h-16 w-16 overflow-hidden border border-line-strong bg-inset"
            >
              {a.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.signedUrl} alt={a.fileName} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center px-1 text-center text-[9px] text-fg-subtle">
                  {a.fileName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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

      {/* Wrapper stops clicks anywhere inside the detail modal (including its
          own backdrop-dismiss) from bubbling back up to this <li>'s
          openDetail handler — without it, dismissing the modal would
          immediately reopen it. */}
      <div onClick={(e) => e.stopPropagation()}>
        <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={request.title}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-fg-subtle">
                {request.authorName} · {formatDateTime(request.createdAt)}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {statusPill}
                {statusAction}
              </div>
            </div>

            {error && <p className="text-[12.5px] text-bad">{error}</p>}

            {request.body ? (
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-muted">
                {request.body}
              </p>
            ) : (
              <p className="text-[13px] italic text-fg-subtle">No additional details.</p>
            )}

            {request.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {request.attachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => a.signedUrl && setLightbox(a)}
                    className="h-20 w-20 overflow-hidden border border-line-strong bg-inset"
                  >
                    {a.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.signedUrl}
                        alt={a.fileName}
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
            )}
          </div>
        </Modal>
      </div>
    </li>
  );
}
