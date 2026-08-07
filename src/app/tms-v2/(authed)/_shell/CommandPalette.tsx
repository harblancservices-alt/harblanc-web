"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@/lib/nav/icons";
import { TMS_V2_NAV, TMS_V2_SETTINGS } from "@/lib/nav/nav.config";
import { searchWorkspace } from "@/actions/tms-v2/search";
import type { SearchResults } from "@/lib/data/search";
import { useShellSearch } from "./ShellSearchProvider";

const ALL_NAV = [...TMS_V2_NAV, TMS_V2_SETTINGS];

/**
 * Global search / ⌘K dialog (shell foundation anchor #4). Trigger buttons
 * live wherever the shell chrome puts them (TopBar's borderless desktop
 * icon, MoreSheet's mobile Search row) — this component only owns the
 * dialog itself, reading its open/close state from ShellSearchProvider so
 * every trigger opens the same instance. Nav items filter instantly
 * client-side (the registry is tiny and already in the bundle);
 * loads/brokers/files are looked up via the searchWorkspace server
 * action, debounced, only once the query is 2+ chars.
 */
export function CommandPalette() {
  const { open, setOpen } = useShellSearch();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ loads: [], brokers: [], files: [] });
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({ loads: [], brokers: [], files: [] });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults({ loads: [], brokers: [], files: [] });
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await searchWorkspace(q);
        setResults(r);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  if (!open) return null;

  const navMatches = ALL_NAV.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6);
  const hasQuery = query.trim().length >= 2;
  const noResults =
    hasQuery && !pending && navMatches.length === 0 && results.loads.length === 0 && results.brokers.length === 0 && results.files.length === 0;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20 sm:pt-28">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => setOpen(false)} aria-hidden />
      <div role="dialog" aria-modal="true" className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-card shadow-e3">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <IconSearch className="h-4 w-4 shrink-0 text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search loads, brokers, files, or pages…"
            className="h-8 w-full bg-transparent text-[15px] text-fg placeholder:text-fg-muted focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-fg-muted">Esc</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-1.5">
          {navMatches.length > 0 ? (
            <PaletteGroup label="Pages">
              {navMatches.map((n) => (
                <PaletteRow key={n.id} label={n.label} sublabel="" onSelect={() => go(n.href)} />
              ))}
            </PaletteGroup>
          ) : null}

          {results.loads.length > 0 ? (
            <PaletteGroup label="Loads">
              {results.loads.map((l) => (
                <PaletteRow key={l.id} label={l.label} sublabel={l.sublabel} onSelect={() => go(l.href)} />
              ))}
            </PaletteGroup>
          ) : null}

          {results.brokers.length > 0 ? (
            <PaletteGroup label="Brokers">
              {results.brokers.map((b) => (
                <PaletteRow key={b.id} label={b.label} sublabel={b.sublabel} onSelect={() => go(b.href)} />
              ))}
            </PaletteGroup>
          ) : null}

          {results.files.length > 0 ? (
            <PaletteGroup label="Files">
              {results.files.map((f) => (
                <PaletteRow key={f.id} label={f.label} sublabel={f.sublabel} onSelect={() => go(f.href)} />
              ))}
            </PaletteGroup>
          ) : null}

          {!hasQuery ? (
            <p className="px-4 py-6 text-center text-[13px] text-fg-muted">
              Type to search pages, loads, brokers, or files.
            </p>
          ) : null}
          {pending ? <p className="px-4 py-3 text-[13px] text-fg-muted">Searching…</p> : null}
          {noResults ? <p className="px-4 py-6 text-center text-[13px] text-fg-muted">No matches for &ldquo;{query}&rdquo;.</p> : null}
        </div>
      </div>
    </div>
  );
}

function PaletteGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5">
      <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function PaletteRow({ label, sublabel, onSelect }: { label: string; sublabel: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-elevated"
    >
      <span className="min-w-0 truncate text-[14px] font-medium text-fg">{label}</span>
      {sublabel ? <span className="min-w-0 shrink truncate text-[12px] text-fg-muted">{sublabel}</span> : null}
    </button>
  );
}
