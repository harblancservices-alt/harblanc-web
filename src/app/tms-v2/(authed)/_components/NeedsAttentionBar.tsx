"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AttentionCategory, AttentionItem } from "@/lib/data/attention";
import { dismissAlert, restoreAlert } from "@/actions/tms-v2/attention";
import type { MutationResult } from "@/lib/demo/mutation";

const CATEGORY_LABEL: Partial<Record<AttentionCategory, string>> = {
  maintenance: "Maintenance",
  receivables: "Overdue receivables",
  documents: "Documents",
  trips: "Open trips",
  expenses: "Incomplete expenses",
  applications: "New applications",
  quotes: "New quote requests",
};

const SEVERITY_DOT: Record<AttentionItem["severity"], string> = {
  red: "bg-bad",
  amber: "bg-warn",
  info: "bg-accent",
};

const UNDO_WINDOW_MS = 4000;

type Group = { category: AttentionCategory; label: string; tone: "red" | "amber"; items: AttentionItem[] };

function groupByCategory(items: AttentionItem[]): Group[] {
  const byCategory = new Map<AttentionCategory, AttentionItem[]>();
  for (const item of items) {
    if (item.category === "opportunity") continue; // its own card, not an alert (legacy parity)
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  const groups: Group[] = [];
  for (const [category, groupItems] of byCategory) {
    groups.push({
      category,
      label: CATEGORY_LABEL[category] ?? category,
      tone: groupItems.some((i) => i.severity === "red") ? "red" : "amber",
      items: groupItems,
    });
  }
  return groups;
}

/**
 * Dashboard's "Needs attention" — a single collapsed bar by default (bell,
 * title, count, chevron), matching legacy admin's AlertsPanel operation:
 * tap to expand into the grouped-by-category list, each category itself
 * expandable. Replaces the old always-open flat list, which blocked the
 * top of the screen. Dismiss/undo is unchanged (dismissAlert/restoreAlert,
 * lib/data/attention.ts's AttentionItem.id as the dismiss key) — just
 * nested one level deeper, inside an expanded category.
 */
export function NeedsAttentionBar({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<AttentionCategory>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = useState<AttentionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // Hide/restore only happen once the write actually confirms — an
  // optimistic hide-then-write here would silently desync the visible list
  // from the database on a failed request (the audit's finding). The
  // pendingIds disable state gives the same "it registered" feedback an
  // optimistic update would, without pretending success early.
  async function onDismiss(e: React.MouseEvent, item: AttentionItem) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setPendingIds((prev) => new Set(prev).add(item.id));
    const result: MutationResult = await dismissAlert(item.id);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setHiddenIds((prev) => new Set(prev).add(item.id));
    setPendingUndo(item);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setPendingUndo((cur) => (cur?.id === item.id ? null : cur));
    }, UNDO_WINDOW_MS);
    router.refresh();
  }

  async function onUndo() {
    if (!pendingUndo) return;
    const item = pendingUndo;
    setError(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingUndo(null);
    const result: MutationResult = await restoreAlert(item.id);
    if (!result.ok) {
      setError(result.reason);
      // The item stays hidden — restore failed, so it's still dismissed in
      // the database; re-showing it here would desync from that.
      return;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    router.refresh();
  }

  function toggleCategory(category: AttentionCategory) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const visibleItems = items.filter((i) => !hiddenIds.has(i.id));
  const groups = groupByCategory(visibleItems);
  const liveTotal = groups.reduce((s, g) => s + g.items.length, 0);

  if (liveTotal === 0) {
    return (
      <>
        <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-bg px-3.5 py-2.5 shadow-e1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok text-white">✓</span>
          <span className="text-[13px] font-medium text-ok">All clear — nothing needs attention.</span>
        </div>
        {error ? <p className="mt-2 text-[13px] font-medium text-bad">{error}</p> : null}
        <UndoBar item={pendingUndo} onUndo={onUndo} />
      </>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-line bg-card shadow-e1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-elevated"
        >
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bad-bg text-bad">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 2a5 5 0 0 0-5 5v2.6l-1.1 2.2A1 1 0 0 0 4.8 13.3h10.4a1 1 0 0 0 .9-1.5L15 9.6V7a5 5 0 0 0-5-5zM8.2 15a1.8 1.8 0 0 0 3.6 0H8.2z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold leading-tight text-fg">Needs attention</span>
            <span className="mt-0.5 block text-[12px] text-fg-muted">
              {liveTotal} alert{liveTotal === 1 ? "" : "s"} · {open ? "tap to collapse" : "tap to view"}
            </span>
          </span>
          <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-bad px-1.5 text-[12px] font-bold tabular-nums text-white">
            {liveTotal}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.29 7.21a1 1 0 0 1 1.42 0L10 10.5l3.29-3.29a1 1 0 1 1 1.42 1.42l-4 4a1 1 0 0 1-1.42 0l-4-4a1 1 0 0 1 0-1.42z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {open ? (
          <div className="border-t border-line">
            {groups.map((g) => (
              <div key={g.category} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleCategory(g.category)}
                  aria-expanded={openCategories.has(g.category)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-elevated"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform ${openCategories.has(g.category) ? "rotate-90" : ""}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 4.29a1 1 0 0 1 1.42 0l5 5a1 1 0 0 1 0 1.42l-5 5a1 1 0 1 1-1.42-1.42L11.5 10 7.21 5.71a1 1 0 0 1 0-1.42z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{g.label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      g.tone === "red" ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn"
                    }`}
                  >
                    {g.items.length}
                  </span>
                </button>

                {openCategories.has(g.category) ? (
                  <div className="bg-elevated px-1 pb-1">
                    {g.items.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-start gap-3 rounded-lg px-2.5 py-2.5 hover:bg-card"
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`} aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-medium text-fg">{item.title}</span>
                          <span className="text-[12px] text-fg-muted">{item.reason}</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => onDismiss(e, item)}
                          disabled={pendingIds.has(item.id)}
                          aria-label={`Dismiss ${item.title}`}
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle hover:bg-card hover:text-fg disabled:opacity-50"
                        >
                          {pendingIds.has(item.id) ? "…" : "Dismiss"}
                        </button>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-elevated px-3.5 py-2 text-[12px] font-medium text-fg-muted hover:bg-card hover:text-fg"
            >
              Collapse
            </button>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[13px] font-medium text-bad">{error}</p> : null}
      <UndoBar item={pendingUndo} onUndo={onUndo} />
    </>
  );
}

function UndoBar({ item, onUndo }: { item: AttentionItem | null; onUndo: () => void }) {
  if (!item) return null;
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-[13px]">
      <span className="text-fg-muted">Dismissed &quot;{item.title}&quot;</span>
      <button type="button" onClick={onUndo} className="font-medium text-accent hover:underline">
        Undo
      </button>
    </div>
  );
}
