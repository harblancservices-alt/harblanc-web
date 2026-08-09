"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "../_shell/format";
import { updateUpgradeStatus, type UpgradeStatus } from "./actions";

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

/**
 * One row in the Upgrades feed — the issue, who posted it and when, its
 * screenshots (click a thumbnail for a full-size lightbox), and a status
 * control. The status select only renders for an owner session
 * (`canEditStatus`); everyone else sees the same pill read-only. The actual
 * permission boundary lives server-side in updateUpgradeStatus, not here —
 * this is just which control the page hands the user.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onStatusChange(next: string) {
    const prev = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await updateUpgradeStatus(request.id, next as UpgradeStatus);
      if (!res.ok) {
        setStatus(prev);
        setError(res.error);
      }
    });
  }

  return (
    <li className="flex flex-col gap-2.5 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-fg">{request.title}</p>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            {request.authorName} · {formatDateTime(request.createdAt)}
          </p>
        </div>

        {canEditStatus ? (
          <select
            value={status}
            disabled={pending}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`h-8 shrink-0 border px-2 text-[11.5px] font-semibold uppercase tracking-wide outline-none disabled:opacity-60 ${
              STATUS_TONE[status] ?? STATUS_TONE.new
            }`}
          >
            <option value="new">New</option>
            <option value="in_review">In review</option>
            <option value="done">Done</option>
          </select>
        ) : (
          <span
            className={`shrink-0 border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              STATUS_TONE[status] ?? STATUS_TONE.new
            }`}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
        )}
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
          onClick={() => setLightbox(null)}
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
    </li>
  );
}
