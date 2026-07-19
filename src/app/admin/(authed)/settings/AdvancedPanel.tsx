"use client";

import { useState } from "react";

/**
 * Advanced · System status — the env-var diagnostics, collapsed by default.
 *
 * The owner reads a red "SYSTEM DIAGNOSTICS" panel as "something is broken",
 * so it no longer renders open. The content itself is unchanged — a developer
 * still needs the exact list — it just lives behind a disclosure now.
 *
 * Collapse state is React state only (no localStorage): every visit starts
 * closed, which is the point.
 */
export function AdvancedPanel({ issues }: { issues: readonly string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-line-strong bg-card shadow-e2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left transition-colors hover:bg-inset sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
            Advanced · System status
          </span>
          <span className="mt-1 block text-[12px] text-ink-2">
            Backend configuration status — for developers. The portal works
            normally.
          </span>
        </span>
        <span
          aria-hidden
          className={
            "shrink-0 font-mono text-[11px] text-ink-3 transition-transform " +
            (open ? "rotate-90" : "")
          }
        >
          ▶
        </span>
      </button>

      {open ? (
        <div className="border-t border-line px-4 pb-4 pt-4 sm:px-5">
          {issues.length > 0 ? (
            <>
              <p className="text-[12px] text-ink-2">
                {issues.length} environment variable
                {issues.length === 1 ? "" : "s"} flagged. These affect
                background features only.
              </p>
              <ul className="mt-3 space-y-2 text-[12px] text-ink">
                {issues.map((msg) => (
                  <li
                    key={msg}
                    className="border-l-2 border-line-strong pl-3 leading-snug"
                  >
                    {msg}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[12px] text-ink-2">
              All environment variables configured. Nothing flagged.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
