"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LIFECYCLE_STAGES, LIFECYCLE_LABEL } from "./lifecycle";
import type { RepOption } from "./CompanyDialog";
import type { CrmTag } from "./tags";
import { BTN_NEUTRAL } from "../_shell/ui";
import { CONTROL_SIZE } from "../_shell/compactForm";
import { StyledSelect } from "../_shell/form";
import { ListSearch } from "../_shell/ListSearch";

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

  /**
   * SEARCH APPLIES AS YOU TYPE. It used to need the button beside it, so
   * typing a company name and seeing the list not move read as "there is no
   * search on this page" — which is exactly what Brent reported. The button
   * is gone.
   *
   * Still the SERVER query, not a browser filter: this page searches
   * crm_accounts.search_tsv, which covers industry, carrier, DOT and MC as
   * well as name and city. Filtering the loaded rows instead would have been
   * simpler and would have silently dropped all of that.
   *
   * Debounced, because every apply is a real round trip and one per
   * keystroke would queue six requests for "Fritz". The timer is cleared on
   * every change, so only the pause at the end of typing sends anything.
   */
  const settled = useRef(q);
  useEffect(() => {
    const next = search.trim();
    if (next === settled.current) return;
    const timer = setTimeout(() => {
      settled.current = next;
      push({ q: next });
    }, 250);
    return () => clearTimeout(timer);
    // `push` is recreated every render and would restart the timer on each
    // keystroke; the query string it closes over is in the deps that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, q, stage, rep, tag, sort]);

  function clearAll() {
    setSearch("");
    startTransition(() => router.push(pathname));
  }

  const selectClass = `disabled:opacity-60 ${CONTROL_SIZE}`;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <ListSearch
        value={search}
        onChange={setSearch}
        label="Search companies"
        placeholder="Search by name, city or state…"
      />

      <div className="flex flex-wrap items-center gap-2">
        <StyledSelect
          value={stage}
          onChange={(e) => push({ stage: e.target.value })}
          disabled={pending}
          aria-label="Filter by lifecycle stage"
          className={selectClass} wrapClassName="min-w-0"
        >
          <option value="">All stages</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {LIFECYCLE_LABEL[s]}
            </option>
          ))}
        </StyledSelect>

        <StyledSelect
          value={rep}
          onChange={(e) => push({ rep: e.target.value })}
          disabled={pending}
          aria-label="Filter by assigned rep"
          className={selectClass} wrapClassName="min-w-0"
        >
          <option value="">All reps</option>
          <option value="unassigned">Unassigned</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </StyledSelect>

        {tags.length > 0 && (
          <StyledSelect
            value={tag}
            onChange={(e) => push({ tag: e.target.value })}
            disabled={pending}
            aria-label="Filter by tag"
            className={selectClass} wrapClassName="min-w-0"
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </StyledSelect>
        )}

        <StyledSelect
          value={sort}
          onChange={(e) => push({ sort: e.target.value })}
          disabled={pending}
          aria-label="Sort companies"
          className={selectClass} wrapClassName="min-w-0"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </StyledSelect>

        {active && (
          <button
            type="button"
            onClick={clearAll}
            disabled={pending}
            className={`inline-flex h-9 items-center rounded-md px-2.5 text-[12.5px] font-semibold transition-colors ${BTN_NEUTRAL}`}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
