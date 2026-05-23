"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { EmailPreviewPanel } from "./EmailPreviewPanel";
import { resendEstimate } from "../actions";

/**
 * Sent Estimates — per-quote historical list of estimates that went out.
 *
 * Phase Q1: per-row Resend button reuses the persisted preview bytes
 * via the resendEstimate server action. A resend inserts a new sent
 * row linked via resent_from_id; the original row is never mutated.
 */

export type SentEstimateRow = {
  id: string;
  sentAt: string;
  sentEmailId: string | null;
  linehaulLow: number | null;
  linehaulHigh: number | null;
  subject: string;
  preheader: string;
  html: string;
  to: string;
  from: string;
  replyTo: string;
  resentFromId: string | null;
  // Phase Q2: bounce ingestion. Populated by the /api/resend-webhook
  // route after Resend reports a bounce or complaint on this send.
  // All three are null on a healthy (or not-yet-reported) send.
  bouncedAt: string | null;
  bounceKind: "hard" | "soft" | "complaint" | null;
  bounceReason: string | null;
};

function formatRate(low: number | null, high: number | null): string {
  if (low == null && high == null) return "—";
  if (low != null && high != null) {
    return `$${low.toLocaleString()} – $${high.toLocaleString()}`;
  }
  const v = (low ?? high) as number;
  return `$${v.toLocaleString()}`;
}

/**
 * Phase Q2: bounce status badge. Renders nothing when the send is
 * healthy. Three states:
 *   - hard       → red, "Bounced" — delivery permanently failed.
 *   - soft       → amber, "Soft bounce" — informational; Resend may
 *                  still retry, or the mailbox may be transiently
 *                  unavailable. Operators decide whether to chase.
 *   - complaint  → red, "Marked spam" — recipient flagged as junk.
 *
 * Exported so SentFinalizedQuotesList and SentBolsList can reuse it.
 */
export function BounceBadge({
  kind,
}: {
  kind: "hard" | "soft" | "complaint" | null;
}) {
  if (!kind) return null;
  const className =
    kind === "soft"
      ? "inline-flex items-center border border-amber-700/60 bg-amber-950/30 px-2 py-1 font-mono text-[9px] tracking-[0.22em] text-amber-300 uppercase"
      : "inline-flex items-center border border-red-700/60 bg-red-950/30 px-2 py-1 font-mono text-[9px] tracking-[0.22em] text-red-300 uppercase";
  const label =
    kind === "hard"
      ? "Bounced"
      : kind === "soft"
        ? "Soft bounce"
        : "Marked spam";
  return <span className={className}>{label}</span>;
}

/**
 * Phase Q2: bounce reason caption. Renders the upstream message from
 * Resend (e.g. "550 5.1.1 mailbox not found") under the row's primary
 * info. Hidden when null. Kept compact (one line, neutral color) so
 * the row stays scannable.
 *
 * Exported so SentFinalizedQuotesList and SentBolsList can reuse it.
 */
export function BounceReason({
  kind,
  reason,
}: {
  kind: "hard" | "soft" | "complaint" | null;
  reason: string | null;
}) {
  if (!kind) return null;
  const prefix =
    kind === "hard"
      ? "Bounced"
      : kind === "soft"
        ? "Soft bounce"
        : "Spam complaint";
  return (
    <p className="font-mono text-[10px] leading-relaxed text-neutral-500">
      <span className={kind === "soft" ? "text-amber-300" : "text-red-300"}>
        {prefix}
      </span>
      {reason ? <> · {reason}</> : null}
    </p>
  );
}

export function SentEstimatesList({ rows }: { rows: SentEstimateRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [resendOpenId, setResendOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onResendSubmit(
    e: React.FormEvent<HTMLFormElement>,
    sourceId: string,
  ) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await resendEstimate(sourceId, fd);
        (e.target as HTMLFormElement).reset();
        setResendOpenId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not resend estimate.");
      }
    });
  }

  if (rows.length === 0) {
    return (
      <section className="mt-8 border border-neutral-800 bg-neutral-950 p-5 sm:p-6">
        <header>
          <h2 className="label-cap">Sent estimates</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            No estimates have been sent for this quote yet. Build a preview
            and send to start the history.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="mt-8 border border-neutral-800 bg-neutral-950">
      <header className="border-b border-neutral-800 px-5 py-4 sm:px-6">
        <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
          Sent estimates
        </h2>
        <p className="mt-1 label-cap text-neutral-500">
          {rows.length} record{rows.length === 1 ? "" : "s"} · newest first
        </p>
      </header>

      <ul className="divide-y divide-neutral-800">
        {rows.map((row) => {
          const open = row.id === openId;
          const resendOpen = row.id === resendOpenId;
          return (
            <li key={row.id}>
              <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className="font-mono text-[10px] tracking-[0.22em] text-green-400 uppercase"
                      title={formatDateFull(row.sentAt)}
                    >
                      Sent {relativeTime(row.sentAt)}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-600">
                      {formatDateFull(row.sentAt)}
                    </span>
                    {row.resentFromId ? (
                      <span className="inline-flex items-center border border-blue-700/60 bg-blue-950/30 px-2 py-0.5 font-mono text-[9px] tracking-[0.22em] text-blue-300 uppercase">
                        Resent
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-white">{row.subject}</p>
                  <p className="text-xs text-neutral-400">
                    To <span className="text-neutral-200">{row.to}</span>
                  </p>
                  <p className="font-mono text-[11px] text-neutral-300">
                    Rate <span className="text-white">{formatRate(row.linehaulLow, row.linehaulHigh)}</span>
                    {row.sentEmailId ? (
                      <>
                        <span aria-hidden className="mx-2 text-neutral-700">·</span>
                        <span className="text-neutral-500">ID {row.sentEmailId.slice(0, 8)}</span>
                      </>
                    ) : null}
                  </p>
                  {row.resentFromId ? (
                    <p className="font-mono text-[10px] text-neutral-500">
                      Resent from {row.resentFromId.slice(0, 8)}
                    </p>
                  ) : null}
                  <BounceReason kind={row.bounceKind} reason={row.bounceReason} />
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="inline-flex items-center border border-green-700/60 bg-green-950/30 px-2 py-1 font-mono text-[9px] tracking-[0.22em] text-green-300 uppercase">
                    Sent
                  </span>
                  <BounceBadge kind={row.bounceKind} />
                  <button
                    type="button"
                    onClick={() => { setResendOpenId(resendOpen ? null : row.id); setError(null); }}
                    className="border border-neutral-700 bg-neutral-900 px-4 py-2.5 font-mono text-[10px] tracking-[0.22em] text-neutral-300 uppercase transition-colors hover:border-neutral-500 hover:text-white"
                  >
                    {resendOpen ? "Cancel resend" : "Resend"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : row.id)}
                    aria-expanded={open}
                    className="border border-neutral-700 bg-neutral-900 px-4 py-2.5 font-mono text-[10px] tracking-[0.22em] text-neutral-300 uppercase transition-colors hover:border-neutral-500 hover:text-white"
                  >
                    {open ? "Hide" : "View sent preview"}
                  </button>
                </div>
              </div>
              {resendOpen ? (
                <ResendForm
                  defaultTo={row.to}
                  isPending={isPending}
                  error={error}
                  onCancel={() => { setResendOpenId(null); setError(null); }}
                  onSubmit={(e) => onResendSubmit(e, row.id)}
                />
              ) : null}
              {open ? (
                <div className="border-t border-neutral-800 bg-neutral-900/40 p-4 sm:p-6">
                  {row.html ? (
                    <EmailPreviewPanel
                      preview={{ to: row.to, from: row.from, replyTo: row.replyTo, subject: row.subject, preheader: row.preheader, html: row.html }}
                    />
                  ) : (
                    <p className="text-sm text-neutral-400">
                      The stored preview for this estimate is empty.
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ResendForm({
  defaultTo,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  defaultTo: string;
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 border-t border-neutral-800 bg-neutral-900/60 p-4 sm:p-6"
    >
      <header>
        <p className="text-[11px] font-semibold tracking-[0.18em] text-blue-300 uppercase">Resend</p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">
          Redelivers the same document content (byte-identical to the original send)
          using the persisted preview bytes. Optionally override the recipient if
          the original address was wrong.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label-cap">Recipient (override optional)</label>
          <input
            type="email"
            name="to"
            defaultValue={defaultTo}
            className="mt-2 block w-full border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
            placeholder={defaultTo}
          />
        </div>
        <div>
          <label className="label-cap">Reason (optional note)</label>
          <input
            type="text"
            name="reason"
            className="mt-2 block w-full border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
            placeholder="e.g. customer said original bounced"
          />
        </div>
      </div>
      {error ? (
        <div role="alert" className="flex items-start gap-3 border border-red-700 bg-red-950/30 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}
      <p className="text-xs leading-relaxed text-neutral-500">
        This creates a new sent row linked to the original. Lead status is NOT changed by a resend.
      </p>
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-neutral-800 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Resending..." : "Resend"}
        </button>
      </div>
    </form>
  );
}
