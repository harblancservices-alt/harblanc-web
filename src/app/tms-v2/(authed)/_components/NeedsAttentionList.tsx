"use client";

import { useState } from "react";
import Link from "next/link";
import type { AttentionItem } from "@/lib/data/attention";

const SEVERITY_DOT: Record<AttentionItem["severity"], string> = {
  red: "bg-bad",
  amber: "bg-warn",
};

// Enough to show the real shape of the list without a wall of rows on a
// good day gone slightly wrong — anything past this collapses behind a
// "Show N more" toggle rather than growing the page unbounded.
const CAP = 8;

/** The Today page's prioritized "Needs Attention" list (v2-design.md §3) —
 * one flat, severity-sorted list, each row a direct link to the fix. Client
 * component only for the cap/expand toggle; the data itself is server-
 * rendered (getNeedsAttention(), lib/data/attention.ts). */
export function NeedsAttentionList({ items }: { items: AttentionItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-card px-4 py-8 text-center">
        <p className="text-[14px] font-medium text-fg">All clear</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Nothing needs attention — paperwork, receivables, maintenance, and trips all look good.
        </p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, CAP);
  const remaining = items.length - visible.length;

  return (
    <div className="flex flex-col">
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
  );
}
