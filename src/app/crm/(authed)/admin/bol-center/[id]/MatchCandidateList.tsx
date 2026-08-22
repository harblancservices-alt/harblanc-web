"use client";

import type { ReactNode } from "react";
import { Badge, BTN_PRIMARY } from "../../../_shell/ui";
import { MATCH_TIER_LABEL, type ScoredMatch } from "../matching";

/** What actually drove the score, straight from the real matcher's own
 * `sameCityState` signal — not a separate estimate. */
export function matchSignalLabel<T>(m: ScoredMatch<T>): string {
  return m.sameCityState ? "Name + location matched" : "Name matched";
}

/**
 * Shared "possible matches" review list — one row per real ranked candidate
 * (never fewer than the matcher itself returns, never padded). Used by both
 * company and contact rows so the review UI reads identically everywhere it
 * shows up on this page.
 */
export function MatchCandidateList<T>({
  candidates,
  pending,
  onUse,
  renderTitle,
  renderSubtitle,
  renderMeta,
}: {
  candidates: ScoredMatch<T>[];
  pending: boolean;
  onUse: (row: T) => void;
  renderTitle: (row: T) => string;
  renderSubtitle: (row: T) => string;
  renderMeta?: (row: T) => ReactNode;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {candidates.map((m, i) => (
        <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-strong px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[13.5px] font-semibold text-fg">{renderTitle(m.row)}</p>
              <Badge tone={m.tier === "exact" ? "success" : m.tier === "likely" ? "accent" : "neutral"}>
                {MATCH_TIER_LABEL[m.tier]} · {Math.round(m.score * 100)}%
              </Badge>
            </div>
            <p className="text-[11.5px] text-fg-muted">
              {renderSubtitle(m.row)} · {matchSignalLabel(m)}
            </p>
            {renderMeta && <div className="mt-1">{renderMeta(m.row)}</div>}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => onUse(m.row)}
            className={`inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:opacity-60 ${BTN_PRIMARY}`}
          >
            Use this
          </button>
        </li>
      ))}
    </ul>
  );
}
