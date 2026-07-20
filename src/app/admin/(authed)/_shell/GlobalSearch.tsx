"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchHit, type SearchResults } from "./search-actions";
import { IconBuilding, IconFiles, IconSearch, IconStack } from "./icons";

/**
 * Level 4 — global search.
 *
 * One command-palette overlay for the whole portal: type, and Loads, Brokers
 * and Files come back grouped; tap or Enter to jump to the record.
 *
 * Mounted ONCE, by PortalShell, so a single instance owns the open state and
 * the results. The triggers — the top bar's search icon and the mobile nav's
 * Search tab — are separate components that just fire a window event, which is
 * what lets a server-rendered top bar open a client overlay without dragging
 * the whole bar across the client boundary.
 *
 * Keyboard (desktop): ⌘K / Ctrl-K opens from anywhere, ↑ ↓ move, Enter opens
 * the highlighted row, Esc closes. Touch: the whole row is the hit target.
 */

/** Trigger → overlay channel. Both triggers dispatch it; the overlay listens. */
export const OPEN_SEARCH_EVENT = "harblanc:open-search";

export function openGlobalSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}

/** Debounce — long enough that typing a load number is one query, not six. */
const DEBOUNCE_MS = 180;

type Group = {
  key: "loads" | "brokers" | "files";
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  hits: SearchHit[];
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Monotonic request id — an older in-flight search must never overwrite a
  // newer one's results, which is otherwise exactly what happens when a broad
  // two-letter query resolves after the narrow one that replaced it.
  const seq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setActive(0);
  }, []);

  // Open on the trigger event, and on ⌘K / Ctrl-K from anywhere in the portal.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // While open: focus the box and lock the page behind it from scrolling —
  // the same body-lock idiom DocViewer and the other portal dialogs use.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced search. The cleanup clears the pending timer, so each keystroke
  // replaces the last rather than queueing another round trip.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const timer = setTimeout(() => {
      globalSearch(q)
        .then((r) => {
          if (id !== seq.current) return;
          setResults(r);
          setActive(0);
        })
        .catch(() => {
          if (id === seq.current) setResults(null);
        })
        .finally(() => {
          if (id === seq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  const groups = useMemo<Group[]>(() => {
    if (!results) return [];
    return (
      [
        {
          key: "loads" as const,
          label: "Loads",
          Icon: IconStack,
          hits: results.loads,
        },
        {
          key: "brokers" as const,
          label: "Brokers",
          Icon: IconBuilding,
          hits: results.brokers,
        },
        {
          key: "files" as const,
          label: "Files",
          Icon: IconFiles,
          hits: results.files,
        },
      ] satisfies Group[]
    ).filter((g) => g.hits.length > 0);
  }, [results]);

  // The groups flattened in render order — ↑/↓ and Enter walk THIS, so the
  // highlight crosses group headers exactly the way the eye does.
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        // Wrap, so ↓ off the bottom returns to the first hit.
        return (next + flat.length) % flat.length;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[active];
      if (hit) go(hit.href);
    }
  }

  // Keep the highlighted row in view when the keyboard walks past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const short = query.trim().length > 0 && query.trim().length < 2;
  const empty =
    !loading && results != null && flat.length === 0 && query.trim().length >= 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search loads, brokers and files"
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-0 sm:p-8"
      onClick={close}
    >
      {/* The panel. Full-bleed on a phone (a palette floating in the middle of
          a 360px screen wastes the only space there is), a centred sheet from
          sm up. Height is capped so the list scrolls inside the panel rather
          than the panel growing past the viewport. */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-line-strong bg-card shadow-e3 sm:h-auto sm:max-h-[70vh] sm:rounded-lg sm:border"
      >
        {/* Search row */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line-strong bg-inset px-3 py-2.5">
          <IconSearch className="h-4 w-4 shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search loads, brokers, files…"
            aria-label="Search loads, brokers and files"
            autoComplete="off"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
          />
          {loading ? (
            <span
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-accent"
            />
          ) : null}
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle transition-colors hover:text-fg"
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {query.trim().length === 0 ? (
            <Hint>
              Type to search loads, brokers and files. Load #, broker, city, MC
              or DOT all match.
            </Hint>
          ) : short ? (
            <Hint>Keep typing — two characters minimum.</Hint>
          ) : empty ? (
            <Hint>No loads, brokers or files match “{query.trim()}”.</Hint>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="mb-2 last:mb-0">
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <g.Icon className="h-3.5 w-3.5 text-fg-subtle" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-muted">
                    {g.label}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                    · {g.hits.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {g.hits.map((hit) => {
                    const i = flat.indexOf(hit);
                    return (
                      <ResultRow
                        key={`${g.key}:${hit.id}`}
                        hit={hit}
                        active={i === active}
                        onHover={() => setActive(i)}
                        onSelect={() => go(hit.href)}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Keyboard legend — desktop only; it's noise on a touch screen. */}
        <div className="hidden shrink-0 items-center gap-3 border-t border-line bg-inset px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle sm:flex">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto">⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-8 text-center font-mono text-[12px] leading-relaxed text-fg-subtle">
      {children}
    </div>
  );
}

/**
 * One result. A button rather than a Link so the overlay closes before the
 * navigation starts — a Link would leave the palette painted over the page it
 * just opened until the route resolved.
 */
function ResultRow({
  hit,
  active,
  onHover,
  onSelect,
}: {
  hit: SearchHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-active={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      // tabIndex -1: the input keeps focus and drives the list with ↑/↓, so
      // Tab must not walk into a 30-item result list.
      tabIndex={-1}
      className={
        "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors " +
        (active
          ? "border-accent/50 bg-inset"
          : "border-transparent hover:bg-inset")
      }
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-tight text-fg">
          {hit.title}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-tight text-fg-muted">
          {hit.subtitle}
        </span>
      </span>
      {hit.meta ? (
        <span className="shrink-0 rounded border border-line-strong bg-inset px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-fg-muted shadow-e1">
          {hit.meta}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The top bar's search icon, made real. A client island so PortalTopBar stays
 * a server component — it renders the icon and fires the open event, nothing
 * more.
 */
export function SearchTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      aria-label="Search loads, brokers and files"
      aria-keyshortcuts="Meta+K Control+K"
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-white/10 hover:text-fg " +
        (className ?? "")
      }
    >
      <IconSearch className="h-5 w-5" />
    </button>
  );
}

/**
 * The dashboard's search bar — the phone's entry point into the same palette.
 *
 * A button dressed as a field, not a real input: there is exactly one search
 * box in the portal (the one inside the overlay), and duplicating it here
 * would mean two inputs to keep in sync and a keystroke lost between them.
 * Tapping anywhere on the bar opens the palette with its box already focused.
 */
export function DashboardSearchBar({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      aria-label="Search loads, brokers and files"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      className={
        "flex w-full items-center gap-2.5 rounded-lg border border-line-strong bg-inset px-3 py-2.5 text-left shadow-e1 transition-colors hover:bg-card active:bg-card " +
        (className ?? "")
      }
    >
      <IconSearch className="h-4 w-4 shrink-0 text-fg-subtle" />
      <span className="min-w-0 flex-1 truncate text-[15px] text-fg-subtle">
        Search loads, brokers, files…
      </span>
      {/* Desktop hint only — a phone has no ⌘K to offer. */}
      <span className="hidden shrink-0 rounded border border-line-strong bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle sm:inline">
        ⌘K
      </span>
    </button>
  );
}
