"use client";

import { CONTROL, CONTROL_SIZE } from "./compactForm";

/**
 * THE SEARCH BOX, used by both company lists.
 *
 * Brent: "i need the search bars on the company list under admin account and
 * under workspace. i need to search companies my name."
 *
 * Workspace already HAD a search box — but it only did anything when you
 * pressed a Search button beside it, so typing a name and looking at an
 * unchanged list read as "there is no search here". That button is gone;
 * both pages now narrow as you type.
 *
 * ── ONE CONTROL, TWO FILTERING MECHANISMS, AND WHY ────────────────────
 *
 * This component is only the input. What each page does with the value
 * differs, deliberately:
 *
 *   ADMIN     filters the 99 rows already in the browser. Instant, and it
 *             composes with the All / Unassigned / per-agent tabs for free.
 *   WORKSPACE keeps its existing server query against crm_accounts'
 *             search_tsv index, which also covers industry, carrier, DOT and
 *             MC. Filtering that page in the browser instead would have been
 *             simpler and would have thrown those away.
 *
 * From the keyboard the two are indistinguishable, which is what "behave
 * identically" has to mean here.
 */
export function ListSearch({
  value,
  onChange,
  placeholder = "Search…",
  label,
  /** Shown to the right — "12 of 99", so the count always describes what is
   * actually on screen rather than what exists. */
  hint,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label: string;
  hint?: string | null;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
      <div className="relative min-w-0 flex-1">
        <input
          type="search"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          // Escape clears without reaching for the mouse. type="search" gives
          // some browsers their own clear affordance too; this works
          // everywhere and is the one we can rely on.
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.blur();
              onChange("");
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          className={`w-full min-w-0 ${value ? "pr-16" : "pr-3"} ${CONTROL_SIZE} ${CONTROL}`}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle hover:text-fg"
          >
            Clear
          </button>
        )}
      </div>
      {hint && <span className="shrink-0 text-[11.5px] text-fg-muted">{hint}</span>}
    </div>
  );
}
