"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LIFECYCLE_STAGES, LIFECYCLE_LABEL } from "./lifecycle";
import type { RepOption } from "./CompanyDialog";
import { BTN_NEUTRAL, BTN_PRIMARY } from "../_shell/ui";

/**
 * The Companies-list toolbar: full-text search plus lifecycle / rep filters.
 * Every control writes its state into the URL query string and lets the
 * server component re-query — so the list stays server-rendered and
 * RLS-scoped, and any filtered view is shareable/bookmarkable. Selects apply on
 * change; search applies on submit (Enter or the button).
 */
export function AccountsFilters({
  q,
  stage,
  rep,
  reps,
}: {
  q: string;
  stage: string;
  rep: string;
  reps: RepOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  const active = Boolean(q || stage || rep);

  function push(next: { q?: string; stage?: string; rep?: string }) {
    const merged = { q, stage, rep, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.stage) params.set("stage", merged.stage);
    if (merged.rep) params.set("rep", merged.rep);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    push({ q: search.trim() });
  }

  function clearAll() {
    setSearch("");
    startTransition(() => router.push(pathname));
  }

  const selectClass =
    "h-10 rounded-lg border border-fg-subtle bg-card px-2.5 text-[13px] font-medium text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40 disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form onSubmit={onSearchSubmit} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          aria-label="Search companies"
          className="h-10 min-w-0 flex-1 rounded-lg border border-fg-subtle bg-card px-3 text-[13.5px] font-medium text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="submit"
          disabled={pending}
          className={`inline-flex h-10 shrink-0 items-center rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${BTN_PRIMARY}`}
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={stage}
          onChange={(e) => push({ stage: e.target.value })}
          disabled={pending}
          aria-label="Filter by lifecycle stage"
          className={selectClass}
        >
          <option value="">All stages</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {LIFECYCLE_LABEL[s]}
            </option>
          ))}
        </select>

        <select
          value={rep}
          onChange={(e) => push({ rep: e.target.value })}
          disabled={pending}
          aria-label="Filter by assigned rep"
          className={selectClass}
        >
          <option value="">All reps</option>
          <option value="unassigned">Unassigned</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>

        {active && (
          <button
            type="button"
            onClick={clearAll}
            disabled={pending}
            className={`inline-flex h-10 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors ${BTN_NEUTRAL}`}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
