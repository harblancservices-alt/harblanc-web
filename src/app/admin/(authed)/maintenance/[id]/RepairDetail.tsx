"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { LogServiceModal } from "../LogServiceModal";
import { CategoryIcon, FreshnessBadge } from "../shared";
import { attachRelated, deletePart, deleteReceipt, detachRelated } from "../actions";
import { DocViewer } from "@/components/ui/DocViewer";
import {
  CATEGORY_SLUG,
  POSITION_LABEL,
  formatDate,
  isPosition,
  money,
} from "@/lib/dispatch/repair-log";
import type {
  EntryLite,
  ReceiptView,
  RelatedView,
  RepairEntryFull,
  ServiceFull,
} from "@/lib/dispatch/maintenance-view-types";

export function RepairDetail({
  entry,
  related,
  service,
  currentOdo,
  partGroups,
  allEntries,
}: {
  entry: RepairEntryFull;
  related: RelatedView[];
  service: ServiceFull;
  currentOdo: number;
  partGroups: string[];
  allEntries: EntryLite[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, startTransition] = useTransition();
  const [attachQuery, setAttachQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptView | null>(null);

  const pos = isPosition(entry.position) ? entry.position : null;
  const relatedIds = useMemo(() => new Set(related.map((r) => r.id)), [related]);

  const attachMatches = useMemo(() => {
    const q = attachQuery.trim().toLowerCase();
    if (!q) return [];
    return allEntries
      .filter((e) => e.id !== entry.id && !relatedIds.has(e.id))
      .filter((e) => e.description.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allEntries, attachQuery, relatedIds, entry.id]);

  function runAttach(otherId: string) {
    setErr(null);
    startTransition(async () => {
      try {
        await attachRelated(entry.id, otherId);
        setAttachQuery("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not attach repair.");
      }
    });
  }
  function runDetach(otherId: string) {
    setErr(null);
    startTransition(async () => {
      try {
        await detachRelated(entry.id, otherId);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not unlink repair.");
      }
    });
  }
  function runDeletePart() {
    if (
      !confirm(
        "Remove this part?\n\nThe rest of the visit stays; if it's the only part, the whole service is removed.",
      )
    ) {
      return;
    }
    setErr(null);
    startTransition(async () => {
      try {
        await deletePart(entry.id);
        router.push("/admin/maintenance");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not remove part.");
      }
    });
  }

  const s = entry.service;

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button href="/admin/maintenance" variant="navigate" size="sm">
            ← Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={runDeletePart}
              disabled={busy}
              variant="destructive"
              size="sm"
            >
              Delete part
            </Button>
            <Button
              type="button"
              onClick={() => setEditing(true)}
              variant="edit"
              size="sm"
            >
              Edit service
            </Button>
          </div>
        </div>

        {/* Part header */}
        <div className="rounded-lg border border-line bg-card p-4 shadow-e2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-[20px] font-bold leading-tight text-fg">
              {entry.description}
            </h1>
            {entry.freshness ? <FreshnessBadge freshness={entry.freshness} /> : null}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Link
              href={`/admin/maintenance/category/${CATEGORY_SLUG[entry.category]}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-inset px-2.5 py-[3px] font-mono text-[11px] font-semibold text-ink-2 hover:underline"
            >
              <CategoryIcon category={entry.category} className="h-3.5 w-3.5" />
              {entry.category}
            </Link>
            {entry.reminderInterval != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-steel-bg px-2 py-[3px] font-mono text-[11px] font-semibold text-steel">
                ↻ Every {entry.reminderInterval.toLocaleString()} mi
              </span>
            ) : null}
            {pos && entry.partGroup ? (
              <Link
                href={`/admin/maintenance/set/${encodeURIComponent(entry.partGroup)}`}
                className="inline-flex items-center gap-1 rounded-full bg-slate-bg px-2 py-[3px] font-mono text-[11px] font-semibold text-slate hover:underline"
              >
                {POSITION_LABEL[pos]} · {entry.partGroup} →
              </Link>
            ) : entry.partGroup ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-bg px-2 py-[3px] font-mono text-[11px] font-semibold text-slate">
                {entry.partGroup}
              </span>
            ) : null}
          </div>
        </div>

        {/* This visit (the service) */}
        <section className="mt-5">
          <SectionLabel title="This visit" />
          <div className="rounded-lg border border-line bg-card p-4 shadow-e1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-semibold tabular-nums text-warn">
                  {formatDate(s.date) ?? "—"}
                  {s.odometer != null ? ` · ${s.odometer.toLocaleString()} mi` : ""}
                </p>
                {s.shop ? (
                  <p className="mt-0.5 text-[12.5px] text-fg-muted">{s.shop}</p>
                ) : null}
              </div>
              {s.totalCost != null ? (
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                    Total
                  </p>
                  <p className="font-mono text-[15px] font-bold tabular-nums text-ok">
                    {money(s.totalCost)}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Other parts replaced in this visit */}
            {entry.otherParts.length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                  Also replaced this visit
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {entry.otherParts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/admin/maintenance/${p.id}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-inset px-2.5 py-[3px] text-[12px] font-medium text-fg hover:border-line-strong"
                    >
                      <CategoryIcon category={p.category} className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                      <span className="truncate">
                        {isPosition(p.position) ? `${POSITION_LABEL[p.position]} ` : ""}
                        {p.description}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Receipt */}
            {s.receipts.length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                  Receipt
                </p>
                <div className="space-y-1.5">
                  {/* Tap-to-open, same as every other doc row in the app —
                      the receipt opens in the shared full-screen viewer
                      (Back · zoom · Download · Delete) instead of a new tab. */}
                  {s.receipts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setViewingReceipt(a)}
                      className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-2.5 py-1.5 text-left transition-colors hover:border-line-strong hover:bg-elevated"
                    >
                      <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                        {a.isImage ? "IMG" : "PDF"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                        {a.name}
                      </span>
                      <span aria-hidden className="shrink-0 text-fg-subtle">
                        ›
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {s.notes ? (
              <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-[13px] leading-relaxed text-fg-muted">
                {s.notes}
              </p>
            ) : null}
          </div>
        </section>

        {/* Related repairs */}
        <section className="mt-5">
          <SectionLabel title="Related repairs" count={related.length} />
          {related.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-6 text-center font-mono text-[11.5px] text-ink-3">
              Nothing linked yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {related.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border border-line bg-card px-2.5 py-2"
                >
                  <FreshnessBadge freshness={r.freshness} />
                  <Link href={`/admin/maintenance/${r.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-fg hover:underline">
                      {r.description}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                      {formatDate(r.date) ?? "—"}
                      {r.odometer != null ? ` · ${r.odometer.toLocaleString()} mi` : ""}
                    </span>
                  </Link>
                  <Button
                    type="button"
                    onClick={() => runDetach(r.id)}
                    disabled={busy}
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                  >
                    Unlink
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2">
            <input
              value={attachQuery}
              onChange={(e) => setAttachQuery(e.target.value)}
              disabled={busy}
              autoComplete="off"
              placeholder="+ Attach a related repair…"
              className="w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
            />
            {attachMatches.length > 0 ? (
              <div className="mt-1 overflow-hidden rounded-md border border-line">
                {attachMatches.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => runAttach(e.id)}
                    disabled={busy}
                    className="flex w-full items-center justify-between gap-2 border-b border-line bg-card px-2.5 py-1.5 text-left last:border-b-0 hover:bg-inset disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate text-[12.5px] text-fg">
                      {e.description}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-subtle">
                      {e.odometer != null ? e.odometer.toLocaleString() : "—"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {err ? (
            <p role="alert" className="mt-2 text-[12px] font-semibold text-bad">
              {err}
            </p>
          ) : null}
        </section>
      </div>

      {editing ? (
        <LogServiceModal
          currentOdo={currentOdo}
          partGroups={partGroups}
          editService={service}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
          onDeleted={() => router.push("/admin/maintenance")}
        />
      ) : null}

      {viewingReceipt ? (
        <DocViewer
          doc={{
            name: viewingReceipt.name,
            url: viewingReceipt.url,
            isImage: viewingReceipt.isImage,
          }}
          onClose={() => setViewingReceipt(null)}
          deleteLabel="Delete"
          onDelete={async () => {
            await deleteReceipt(s.id, viewingReceipt.id);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
        {title}
      </span>
      {count != null ? (
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          · {count}
        </span>
      ) : null}
    </div>
  );
}
