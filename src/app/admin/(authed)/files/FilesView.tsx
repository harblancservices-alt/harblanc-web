"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileCategory, FileItem } from "@/lib/admin/files";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocViewer } from "@/components/ui/DocViewer";
import { signFiles, type SignRef } from "./actions";

/**
 * Admin → Files. One newest-first timeline of every uploaded file across the
 * app (load docs, maintenance receipts, customer quote/application uploads),
 * with a search box (load #, broker, lane, doc type, filename) and type filter
 * chips. Mobile-first, V2 chrome.
 *
 * The full timeline arrives as metadata; signed URLs are fetched lazily for the
 * currently visible page only (`signFiles`), so it scales as the file count
 * grows. Viewing reuses the shared full-screen DocViewer.
 */

const PAGE_SIZE = 40;

type FilterKey = "all" | FileCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rate_con", label: "Rate con" },
  { key: "bol", label: "BOL" },
  { key: "signed_bol", label: "Signed BOL" },
  { key: "pod", label: "POD" },
  { key: "receipt", label: "Receipt" },
  { key: "application", label: "Application" },
];

function refKey(bucket: string, path: string): string {
  return `${bucket}\n${path}`;
}

/**
 * Faint per-type wash so the timeline is scannable by colour: rate cons read
 * blue, BOLs green, PODs amber. Receipts (and everything else) keep the plain
 * white card. The 50-step Tailwind tints are the ones globals.css already
 * remaps to translucent fills under `.admin-dark`, so both themes stay legible.
 *
 * No hover swap on the tinted rows: globals.css only remaps the BASE
 * `.bg-blue-100` etc. for dark mode, not the `hover:` variant, so a hover tint
 * would flash a bright light-mode blue over the dark card.
 */
const CATEGORY_TINT: Partial<Record<FileCategory, string>> = {
  rate_con: "bg-blue-50",
  bol: "bg-green-50",
  signed_bol: "bg-green-50",
  pod: "bg-amber-50",
};

function tintFor(category: FileCategory): string {
  return CATEGORY_TINT[category] ?? "bg-card hover:bg-elevated";
}

export function FilesView({ items }: { items: FileItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [viewing, setViewing] = useState<FileItem | null>(null);

  // Signed-URL cache, keyed by `${bucket}\n${path}`. Filled lazily.
  const [signed, setSigned] = useState<Record<string, string>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  // Search: every whitespace token must appear in the item's search blob.
  const searchMatched = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return items;
    return items.filter((it) => tokens.every((t) => it.searchText.includes(t)));
  }, [items, query]);

  // Per-type counts over the search results, so the chips show how many of the
  // current matches fall in each type.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searchMatched.length };
    for (const it of searchMatched) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [searchMatched]);

  const filtered = useMemo(() => {
    if (filter === "all") return searchMatched;
    return searchMatched.filter((it) => it.category === filter);
  }, [searchMatched, filter]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  // Narrowing the result set resets pagination to the first page (done in the
  // change handlers rather than an effect to avoid a cascading render).
  function onSearch(next: string) {
    setQuery(next);
    setVisible(PAGE_SIZE);
  }
  function onFilter(next: FilterKey) {
    setFilter(next);
    setVisible(PAGE_SIZE);
  }

  // Lazily sign the storage paths for whatever is currently on screen — both
  // the thumbnail (images) and the original (so tapping View is instant).
  useEffect(() => {
    const refs: SignRef[] = [];
    for (const it of shown) {
      const orig = refKey(it.bucket, it.storagePath);
      if (!requestedRef.current.has(orig)) {
        requestedRef.current.add(orig);
        refs.push({ bucket: it.bucket, path: it.storagePath });
      }
      if (it.isImage && it.thumbPath) {
        const thumb = refKey(it.bucket, it.thumbPath);
        if (!requestedRef.current.has(thumb)) {
          requestedRef.current.add(thumb);
          refs.push({ bucket: it.bucket, path: it.thumbPath });
        }
      }
    }
    if (refs.length === 0) return;
    let cancelled = false;
    signFiles(refs).then((res) => {
      if (cancelled || Object.keys(res).length === 0) return;
      setSigned((prev) => ({ ...prev, ...res }));
    });
    return () => {
      cancelled = true;
    };
  }, [shown]);

  function origUrl(it: FileItem): string | null {
    return signed[refKey(it.bucket, it.storagePath)] ?? null;
  }
  function thumbUrl(it: FileItem): string | null {
    if (!it.isImage) return null;
    if (it.thumbPath) {
      return signed[refKey(it.bucket, it.thumbPath)] ?? origUrl(it);
    }
    return origUrl(it);
  }

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Records"
          title="Files"
          className="mb-3"
          breadcrumb={`${items.length} file${items.length === 1 ? "" : "s"}`}
        />

        {/* Search — matches load #, broker, lane, doc type, filename. */}
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search load #, broker, lane, type, filename…"
          className="h-[38px] w-full rounded-md border border-line-strong bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
        />

        {/* Type filter chips. */}
        <div className="-mx-1 mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = counts[f.key] ?? 0;
            const active = filter === f.key;
            if (f.key !== "all" && n === 0) return null;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onFilter(f.key)}
                aria-pressed={active}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors " +
                  (active
                    ? "border-accent bg-accent text-white"
                    : "border-line-strong bg-card text-fg-muted hover:bg-elevated")
                }
              >
                {f.label}
                <span
                  className={
                    "tabular-nums " + (active ? "text-white/80" : "text-fg-subtle")
                  }
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {/* Timeline. */}
        {shown.length === 0 ? (
          <div className="mt-4 rounded-md border border-line bg-card px-3 py-10 text-center font-mono text-[13px] text-fg-subtle">
            {items.length === 0 ? "No files uploaded yet." : "No files match."}
          </div>
        ) : (
          <ul className="mt-4 space-y-1.5">
            {shown.map((it) => (
              <li key={it.id}>
                <FileRow
                  item={it}
                  thumb={thumbUrl(it)}
                  onView={() => setViewing(it)}
                />
              </li>
            ))}
          </ul>
        )}

        {visible < filtered.length ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="rounded-md border border-line-strong bg-card px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-elevated"
            >
              Load more ({filtered.length - visible})
            </button>
          </div>
        ) : null}
      </div>

      {viewing ? (
        <DocViewer
          doc={{
            name: viewing.name,
            url: origUrl(viewing),
            isImage: viewing.isImage,
          }}
          onClose={() => setViewing(null)}
          parentHref={viewing.parentHref}
          parentLabel="Open record"
        />
      ) : null}
    </div>
  );
}

function FileRow({
  item,
  thumb,
  onView,
}: {
  item: FileItem;
  thumb: string | null;
  onView: () => void;
}) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-md border border-line px-3 py-2.5 transition-colors " +
        tintFor(item.category)
      }
    >
      {/* Thumbnail / type glyph. */}
      <button
        type="button"
        onClick={onView}
        aria-label={`View ${item.name}`}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-inset"
      >
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
            {item.isImage ? "IMG" : "PDF"}
          </span>
        )}
      </button>

      {/* Name + subtitle. */}
      <button
        type="button"
        onClick={onView}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 rounded-sm bg-elevated px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-muted">
            {item.typeLabel}
          </span>
          <span className="min-w-0 truncate text-[12.5px] font-semibold text-fg">
            {item.name}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
          <span className="min-w-0 truncate">{item.subtitle}</span>
          <span aria-hidden className="text-fg-subtle">
            ·
          </span>
          <span className="shrink-0 tabular-nums text-fg-subtle">
            {item.dateLabel}
          </span>
        </div>
      </button>

      {/* Jump to the parent record. */}
      <Link
        href={item.parentHref}
        prefetch={false}
        aria-label="Open record"
        title="Open record"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-card hover:text-accent"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </Link>
    </div>
  );
}
