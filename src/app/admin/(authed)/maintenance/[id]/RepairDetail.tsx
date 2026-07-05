"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { LogRepairModal } from "../LogRepairModal";
import { attachRelated, detachRelated } from "../actions";
import {
  CATEGORY_SLUG,
  FRESHNESS_META,
  POSITION_LABEL,
  formatDate,
  isPosition,
  money,
} from "@/lib/dispatch/repair-log";
import { CategoryIcon } from "../shared";
import type { EntryLite, RelatedView, RepairEntryFull } from "../types";

export function RepairDetail({
  entry,
  related,
  currentOdo,
  partGroups,
  allEntries,
}: {
  entry: RepairEntryFull;
  related: RelatedView[];
  currentOdo: number;
  partGroups: string[];
  allEntries: EntryLite[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, startTransition] = useTransition();
  const [attachQuery, setAttachQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const pos = isPosition(entry.position) ? entry.position : null;
  const relatedIds = useMemo(
    () => new Set(related.map((r) => r.id)),
    [related],
  );

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

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button href="/admin/maintenance" variant="navigate" size="sm">
            ← Back
          </Button>
          <Button
            type="button"
            onClick={() => setEditing(true)}
            variant="edit"
            size="sm"
          >
            Edit
          </Button>
        </div>

        {/* Header card */}
        <div className="rounded-lg border border-line bg-card p-4 shadow-e2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold leading-tight text-fg">
                {entry.description}
              </h1>
              <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-warn">
                {formatDate(entry.date) ?? "—"}
                {entry.odometer != null
                  ? ` · ${entry.odometer.toLocaleString()} mi`
                  : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {entry.cost != null ? (
                <div className="text-[22px] font-bold leading-none tabular-nums text-ok">
                  {money(entry.cost)}
                </div>
              ) : (
                <div className="font-mono text-[11px] text-fg-subtle">no cost</div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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

          {entry.notes ? (
            <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-[13px] leading-relaxed text-fg-muted">
              {entry.notes}
            </p>
          ) : null}
        </div>

        {/* Receipts */}
        <Section title="Receipts" count={entry.receipts.length}>
          {entry.receipts.length === 0 ? (
            <Empty>No receipts attached.</Empty>
          ) : (
            <div className="space-y-1.5">
              {entry.receipts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-line bg-card px-2.5 py-1.5"
                >
                  <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                    {a.isImage ? "IMG" : "PDF"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                    {a.name}
                  </span>
                  {a.url ? (
                    <Button
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="navigate"
                      size="sm"
                      className="shrink-0"
                    >
                      View
                    </Button>
                  ) : (
                    <span className="shrink-0 font-mono text-[9px] text-fg-subtle">
                      no link
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Related repairs */}
        <Section title="Related repairs" count={related.length}>
          {related.length === 0 ? (
            <Empty>Nothing linked yet.</Empty>
          ) : (
            <div className="space-y-1.5">
              {related.map((r) => {
                const fm = FRESHNESS_META[r.freshness];
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-md border border-line bg-card px-2.5 py-2"
                  >
                    <StatusTag tone={fm.tone} className="shrink-0">
                      {fm.label}
                    </StatusTag>
                    <Link
                      href={`/admin/maintenance/${r.id}`}
                      className="min-w-0 flex-1"
                    >
                      <span className="block truncate text-[12.5px] font-medium text-fg hover:underline">
                        {r.description}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                        {formatDate(r.date) ?? "—"}
                        {r.odometer != null
                          ? ` · ${r.odometer.toLocaleString()} mi`
                          : ""}
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
                );
              })}
            </div>
          )}

          {/* Attach picker */}
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
        </Section>
      </div>

      {editing ? (
        <LogRepairModal
          currentOdo={currentOdo}
          partGroups={partGroups}
          allEntries={allEntries}
          editEntry={entry}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
          onDeleted={() => router.push("/admin/maintenance")}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
          {title}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          · {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-6 text-center font-mono text-[11.5px] text-ink-3">
      {children}
    </div>
  );
}
