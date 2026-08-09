"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LIFECYCLE_STAGES, LIFECYCLE_LABEL } from "./lifecycle";
import type { RepOption } from "./CompanyDialog";
import type { CrmTag } from "./tags";
import { BTN_NEUTRAL, BTN_PRIMARY } from "../_shell/ui";

const SORT_OPTIONS = [
  { value: "", label: "Newest first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "stale", label: "Last contact (coldest first)" },
] as const;

/**
 * The Companies-list toolbar: full-text search plus lifecycle / rep / tag
 * filters and a sort control. Every control writes its state into the URL
 * query string and lets the server component re-query — so the list stays
 * server-rendered and RLS-scoped, and any filtered/sorted view is
 * shareable/bookmarkable. Selects apply on change; search applies on submit
 * (Enter or the button).
 */
export function AccountsFilters({
  q,
  stage,
  rep,
  tag,
  sort,
  reps,
  tags,
}: {
  q: string;
  stage: string;
  rep: string;
  tag: string;
  sort: string;
  reps: RepOption[];
  tags: CrmTag[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  const active = Boolean(q || stage || rep || tag || sort);

  function push(next: { q?: string; stage?: string; rep?: string; tag?: string; sort?: string }) {
    const merged = { q, stage, rep, tag, sort, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.stage) params.set("stage", merged.stage);
    if (merged.rep) params.set("rep", merged.rep);
    if (merged.tag) params.set("tag", merged.tag);
    if (merged.sort) params.set("sort", merged.sort);
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
    "h-10 border border-fg-subtle bg-card px-2.5 text-[13px] font-medium text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40 disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form onSubmit={onSearchSubmit} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies…"
          aria-label="Search companies"
          className="h-10 min-w-0 flex-1 border border-fg-subtle bg-card px-3 text-[13.5px] font-medium text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40"
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

        {tags.length > 0 && (
          <select
            value={tag}
            onChange={(e) => push({ tag: e.target.value })}
            disabled={pending}
            aria-label="Filter by tag"
            className={selectClass}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}

        <select
          value={sort}
          onChange={(e) => push({ sort: e.target.value })}
          disabled={pending}
          aria-label="Sort companies"
          className={selectClass}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
