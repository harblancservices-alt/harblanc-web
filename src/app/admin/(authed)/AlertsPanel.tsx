"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusTag } from "@/components/ui/StatusTag";
import {
  totalAlerts,
  type AlertGroup,
  type AlertGroupKey,
} from "@/lib/dispatch/alerts";

/**
 * "Needs attention" — the dashboard's alert panel.
 *
 * Collapsed by default to a slim trip-card-chrome tab (bell + title + count
 * badge) so the dashboard opens on the work, not on a wall of warnings; tap it
 * to drop down the grouped list. Groups are themselves collapsible, so the
 * expanded state is still a short list of category headers until you open one.
 *
 * Zero alerts swaps the whole thing for the green "All clear" state.
 *
 * State is React-only and per-render (no localStorage) — an alert panel that
 * remembered being collapsed would hide new alerts, which is the one thing it
 * must never do.
 */

export function AlertsPanel({ groups }: { groups: ReadonlyArray<AlertGroup> }) {
  const [open, setOpen] = useState(false);
  // Which groups are expanded. Multiple may be open at once.
  const [openGroups, setOpenGroups] = useState<Set<AlertGroupKey>>(new Set());

  const live = groups.filter((g) => g.items.length > 0);
  const total = totalAlerts(live);

  if (total === 0) return <AllClear />;

  function toggleGroup(key: AlertGroupKey) {
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="border-b border-line bg-canvas px-4 pb-3 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* The tab itself — trip-card chrome (rounded-lg, border-line-strong,
            bg-card, e2). Collapsed it's one row; expanded it grows the list
            inside the same card so the panel reads as a single object. */}
        <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-inset active:bg-inset"
          >
            {/* Bell — the attention animation rides on this icon only, not the
                whole card, so it stays a glance-level cue rather than a
                thrashing panel. Pauses once the panel is open (you're already
                looking at it) and under prefers-reduced-motion. */}
            <span
              aria-hidden
              className={
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bad-bg text-bad " +
                (open ? "" : "alert-bell")
              }
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10 2a5 5 0 0 0-5 5v2.6l-1.1 2.2A1 1 0 0 0 4.8 13.3h10.4a1 1 0 0 0 .9-1.5L15 9.6V7a5 5 0 0 0-5-5zM8.2 15a1.8 1.8 0 0 0 3.6 0H8.2z" />
              </svg>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight text-fg">
                Needs attention
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-fg-muted">
                {total} alert{total === 1 ? "" : "s"} ·{" "}
                {open ? "tap to collapse" : "tap to view"}
              </span>
            </span>

            {/* Count badge — the red total. */}
            <span
              className={
                "inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-bad px-1.5 text-[12px] font-bold tabular-nums text-white shadow-e1 " +
                (open ? "" : "alert-badge")
              }
            >
              {total}
            </span>

            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className={
                "h-4 w-4 shrink-0 text-fg-subtle transition-transform " +
                (open ? "rotate-180" : "")
              }
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
              {live.map((g) => (
                <AlertGroupRow
                  key={g.key}
                  group={g}
                  expanded={openGroups.has(g.key)}
                  onToggle={() => toggleGroup(g.key)}
                />
              ))}

              {/* Collapse handle — pushes the panel back up from the bottom,
                  so a long expanded list doesn't force a scroll back to the
                  header to close it. */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-line bg-inset px-3.5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted transition-colors hover:bg-card hover:text-fg"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                  className="h-3.5 w-3.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M14.71 12.79a1 1 0 0 1-1.42 0L10 9.5l-3.29 3.29a1 1 0 0 1-1.42-1.42l4-4a1 1 0 0 1 1.42 0l4 4a1 1 0 0 1 0 1.42z"
                    clipRule="evenodd"
                  />
                </svg>
                Collapse
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One category: a header row carrying the label + count, which expands to the
 * individual tap-through items.
 */
function AlertGroupRow({
  group,
  expanded,
  onToggle,
}: {
  group: AlertGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-inset"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className={
            "h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        >
          <path
            fillRule="evenodd"
            d="M7.21 4.29a1 1 0 0 1 1.42 0l5 5a1 1 0 0 1 0 1.42l-5 5a1 1 0 1 1-1.42-1.42L11.5 10 7.21 5.71a1 1 0 0 1 0-1.42z"
            clipRule="evenodd"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg">
          {group.label}
        </span>
        <StatusTag tone={group.tone} hideDot className="shrink-0 tabular-nums">
          {group.items.length}
        </StatusTag>
      </button>

      {expanded ? (
        <div className="bg-inset">
          {group.items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              className="flex items-start gap-3 border-t border-line px-3.5 py-2.5 transition-colors hover:bg-card"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight text-fg">
                  {item.title}
                </span>
                {item.subtitle ? (
                  <span className="mt-0.5 block truncate text-[11.5px] text-fg-muted">
                    {item.subtitle}
                  </span>
                ) : null}
                {item.chips && item.chips.length > 0 ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {item.chips.map((c) => (
                      <StatusTag key={c.label} tone={c.tone}>
                        {c.label}
                      </StatusTag>
                    ))}
                  </span>
                ) : null}
              </span>

              {item.value ? (
                <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-fg">
                  {item.value}
                </span>
              ) : null}

              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 4.29a1 1 0 0 1 1.42 0l5 5a1 1 0 0 1 0 1.42l-5 5a1 1 0 1 1-1.42-1.42L11.5 10 7.21 5.71a1 1 0 0 1 0-1.42z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Nothing waiting — the same friendly green banner the old alert bar used. */
function AllClear() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-ok/25 bg-ok-bg px-4 py-2">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white shadow-sm"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3 w-3">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42.006l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.79 2.79 6.796-6.886a1 1 0 0 1 1.414-.006z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ok">
        All clear — you&apos;re caught up
      </span>
    </div>
  );
}
