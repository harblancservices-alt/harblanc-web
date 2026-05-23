"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateFull, relativeTime } from "@/lib/admin/format";
import { EmailPreviewPanel } from "./EmailPreviewPanel";
import { ResendForm, BounceBadge, BounceReason } from "./SentEstimatesList";
import { resendBol } from "../bol-actions";

export type SentBolRow = {
  id: string;
  bolNumber: string;
  sentAt: string;
  sentEmailId: string | null;
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

export function SentBolsList({ rows }: { rows: SentBolRow[] }) {
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
        await resendBol(sourceId, fd);
        (e.target as HTMLFormElement).reset();
        setResendOpenId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not resend BOL.");
      }
    });
  }

  if (rows.length === 0) {
    return (
      <section className="border border-neutral-800 bg-neutral-950 p-5 sm:p-6">
        <header>
          <h2 className="label-cap">Sent bills of lading</h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-400">
            No bills of lading have been issued for this lead yet.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="border border-neutral-800 bg-neutral-950">
      <header className="border-b border-neutral-800 px-5 py-4 sm:px-6">
        <h2 className="label-cap">Sent bills of lading</h2>
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
                    <span className="font-mono text-[10px] tracking-[0.22em] text-green-400 uppercase" title={formatDateFull(row.sentAt)}>
                      Sent {relativeTime(row.sentAt)}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-600">{formatDateFull(row.sentAt)}</span>
                    {row.resentFromId ? (
                      <span className="inline-flex items-center border border-blue-700/60 bg-blue-950/30 px-2 py-0.5 font-mono text-[9px] tracking-[0.22em] text-blue-300 uppercase">
                        Resent
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {row.bolNumber}
                    <span className="ml-2 font-normal text-neutral-400">{row.subject}</span>
                  </p>
                  <p className="text-xs text-neutral-400">
                    To <span className="text-neutral-200">{row.to}</span>
                  </p>
                  {row.sentEmailId ? (
                    <p className="font-mono text-[11px] text-neutral-500">ID {row.sentEmailId.slice(0, 8)}</p>
                  ) : null}
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
                    {open ? "Hide" : "View sent BOL"}
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
                      The stored preview for this BOL is empty.
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
