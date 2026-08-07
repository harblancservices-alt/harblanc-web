"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AttentionItem } from "@/lib/data/attention";
import { dismissAlert, restoreAlert } from "@/actions/tms-v2/attention";

const SEVERITY_DOT: Record<AttentionItem["severity"], string> = {
  red: "bg-bad",
  amber: "bg-warn",
  info: "bg-accent",
};

// Enough to show the real shape of the list without a wall of rows on a
// good day gone slightly wrong — anything past this collapses behind a
// "Show N more" toggle rather than growing the page unbounded.
const CAP = 8;
const UNDO_WINDOW_MS = 4000;

/** The Today page's prioritized "Needs Attention" list (v2-design.md §3) —
 * one flat, severity-sorted list, each row a direct link to the fix
 * (Phase 5C's deep-link anchors land pre-scrolled on the section that
 * fixes it) plus a Dismiss control with a 4-second Undo (Phase 5D, V1's
 * own dismissed_alerts pattern — src/actions/tms-v2/attention.ts). Client
 * component for the cap/expand toggle and the dismiss/undo state; the data
 * itself is server-rendered (getNeedsAttention(), lib/data/attention.ts). */
export function NeedsAttentionList({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = useState<AttentionItem | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  async function onDismiss(e: React.MouseEvent, item: AttentionItem) {
    e.preventDefault();
    e.stopPropagation();
    setHiddenIds((prev) => new Set(prev).add(item.id));
    setPendingUndo(item);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setPendingUndo((cur) => (cur?.id === item.id ? null : cur));
    }, UNDO_WINDOW_MS);
    await dismissAlert(item.id);
    router.refresh();
  }

  async function onUndo() {
    if (!pendingUndo) return;
    const item = pendingUndo;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingUndo(null);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    await restoreAlert(item.id);
    router.refresh();
  }

  const visibleItems = items.filter((i) => !hiddenIds.has(i.id));

  if (visibleItems.length === 0 && !pendingUndo) {
    return (
      <div className="rounded-xl border border-line bg-card px-4 py-8 text-center shadow-e1">
        <p className="text-[14px] font-medium text-fg">All clear</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Nothing needs attention — paperwork, receivables, maintenance, and trips all look good.
        </p>
      </div>
    );
  }

  const visible = expanded ? visibleItems : visibleItems.slice(0, CAP);
  const remaining = visibleItems.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      {pendingUndo ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-elevated px-3 py-2 text-[13px]">
          <span className="text-fg-muted">Dismissed &quot;{pendingUndo.title}&quot;</span>
          <button type="button" onClick={onUndo} className="font-medium text-accent hover:underline">
            Undo
          </button>
        </div>
      ) : null}

      <div className="flex flex-col rounded-xl border border-line bg-card px-3 shadow-e1">
        {visible.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-start gap-3 border-b border-line px-1 py-3 last:border-b-0 hover:bg-elevated"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[item.severity]}`}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[14px] font-medium text-fg">{item.title}</span>
              <span className="text-[13px] text-fg-muted">{item.reason}</span>
            </span>
            <button
              type="button"
              onClick={(e) => onDismiss(e, item)}
              aria-label={`Dismiss ${item.title}`}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-fg-subtle hover:bg-card hover:text-fg"
            >
              Dismiss
            </button>
          </Link>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-1 py-3 text-left text-[13px] font-medium text-accent hover:underline"
          >
            Show {remaining} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
