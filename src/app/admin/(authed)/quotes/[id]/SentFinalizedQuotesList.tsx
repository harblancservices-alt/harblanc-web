"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { EmailPreviewPanel } from "./EmailPreviewPanel";
import { ResendForm, BounceBadge, BounceReason } from "./SentEstimatesList";
import { resendFinalizedQuote } from "../finalized-quote-actions";

export type SentFinalizedQuoteRow = {
  id: string;
  finalizedQuoteNumber: string;
  sentAt: string;
  sentEmailId: string | null;
  totalAmount: number | null;
  subject: string;
  preheader: string;
  html: string;
  to: string;
  from: string;
  replyTo: string;
  resentFromId: string | null;
  // Phase Q2: bounce ingestion. See SentEstimateRow for details.
  bouncedAt: string | null;
  bounceKind: "hard" | "soft" | "complaint" | null;
  bounceReason: string | null;
};

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SentFinalizedQuotesList({ rows }: { rows: SentFinalizedQuoteRow[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [resendOpenId, setResendOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onResendSubmit(e: React.FormEvent<HTMLFormElement>, sourceId: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await resendFinalizedQuote(sourceId, fd);
        (e.target as HTMLFormElement).reset();
        setResendOpenId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not resend finalized quote.");
      }
    });
  }

  if (rows.length === 0) {
    return (
      <section className="border border-zinc-200 bg-zinc-50 p-5 sm:p-6">
        <header>
          <h2 className="label-cap">Sent finalized quotes</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            No finalized quotes have been sent for this lead yet.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-zinc-50">
      <header className="border-b border-zinc-200 px-5 py-4 sm:px-6">
        <h2 className="label-cap">Sent finalized quotes</h2>
        <p className="mt-1 label-cap text-zinc-600">
          {rows.length} record{rows.length === 1 ? "" : "s"} · newest first
        </p>

        {/* Phase OPS-2B: "Most recent" action strip — same pattern as
            SentEstimatesList. Saves scrolling on multi-FQ leads. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-200 pt-3">
          <span className="font-mono text-xs text-zinc-700">
            <span className="label-cap text-zinc-600">Most recent</span>
            <span aria-hidden className="mx-2 text-zinc-500">·</span>
            <span className="text-zinc-900" title={formatDateFull(rows[0].sentAt)}>
              {relativeTime(rows[0].sentAt)}
            </span>
            <span aria-hidden className="mx-2 text-zinc-500">·</span>
            <span className="text-zinc-900">{rows[0].finalizedQuoteNumber}</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setResendOpenId(null);
                setOpenId(openId === rows[0].id ? null : rows[0].id);
              }}
              className="inline-flex items-center border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:text-zinc-900"
            >
              {openId === rows[0].id ? "Hide preview" : "Open preview"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenId(null);
                setResendOpenId(resendOpenId === rows[0].id ? null : rows[0].id);
                setError(null);
              }}
              className="inline-flex items-center border border-zinc-300 bg-white px-3 py-1.5 font-mono text-xs tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:text-zinc-900"
            >
              {resendOpenId === rows[0].id ? "Cancel resend" : "Resend"}
            </button>
          </div>
        </div>
      </header>
      <ul className="divide-y divide-zinc-200">
        {rows.map((row) => {
          const open = row.id === openId;
          const resendOpen = row.id === resendOpenId;
          return (
            <li key={row.id}>
              <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-xs tracking-[0.12em] text-green-800 uppercase" title={formatDateFull(row.sentAt)}>
                      Sent {relativeTime(row.sentAt)}
                    </span>
                    <span className="font-mono text-xs text-zinc-600">{formatDateFull(row.sentAt)}</span>
                    {row.resentFromId ? (
                      <span className="inline-flex items-center border border-blue-300 bg-blue-50 px-2 py-0.5 font-mono text-xs tracking-[0.12em] text-blue-800 uppercase">
                        Resent
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {row.finalizedQuoteNumber}
                    <span className="ml-2 font-normal text-zinc-600">{row.subject}</span>
                  </p>
                  <p className="text-xs text-zinc-600">
                    To <span className="text-zinc-800">{row.to}</span>
                  </p>
                  <p className="font-mono text-xs text-zinc-700">
                    Total <span className="text-zinc-900">{row.totalAmount !== null ? formatUsd(row.totalAmount) : "—"}</span>
                    {row.sentEmailId ? (
                      <>
                        <span aria-hidden className="mx-2 text-zinc-600">·</span>
                        <span className="text-zinc-600">ID {row.sentEmailId.slice(0, 8)}</span>
                      </>
                    ) : null}
                  </p>
                  {row.resentFromId ? (
                    <p className="font-mono text-xs text-zinc-600">
                      Resent from {row.resentFromId.slice(0, 8)}
                    </p>
                  ) : null}
                  <BounceReason kind={row.bounceKind} reason={row.bounceReason} />
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="inline-flex items-center border border-green-300 bg-green-50 px-2 py-1 font-mono text-xs tracking-[0.12em] text-green-800 uppercase">
                    Sent
                  </span>
                  <BounceBadge kind={row.bounceKind} />
                  <button
                    type="button"
                    onClick={() => { setResendOpenId(resendOpen ? null : row.id); setError(null); }}
                    className="border border-zinc-300 bg-white px-4 py-2.5 font-mono text-xs tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:text-zinc-900"
                  >
                    {resendOpen ? "Cancel resend" : "Resend"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : row.id)}
                    aria-expanded={open}
                    className="border border-zinc-300 bg-white px-4 py-2.5 font-mono text-xs tracking-[0.12em] text-zinc-700 uppercase transition-colors hover:border-zinc-400 hover:text-zinc-900"
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
                <div className="border-t border-zinc-200 bg-zinc-100 p-4 sm:p-6">
                  {row.html ? (
                    <EmailPreviewPanel
                      preview={{ to: row.to, from: row.from, replyTo: row.replyTo, subject: row.subject, preheader: row.preheader, html: row.html }}
                    />
                  ) : (
                    <p className="text-sm text-zinc-600">
                      The stored preview for this finalized quote is empty.
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
