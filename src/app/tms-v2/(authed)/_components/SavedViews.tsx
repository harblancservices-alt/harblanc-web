"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type SavedView = { name: string; query: string };

/** Per-browser saved filter presets (Phase 6 item 6) — no schema change:
 * persisted to localStorage, not the database, so this is scoped to the
 * device/browser the operator actually uses rather than a synced,
 * account-wide feature. Each preset is just a name + the current query
 * string; "applying" one is a real navigation (a Link), so it's still a
 * plain, shareable-if-copied URL — filters themselves stay the single
 * source of truth, this is only a bookmark for them. */
export function SavedViews({ storageKey }: { storageKey: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [views, setViews] = useState<SavedView[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setViews(raw ? (JSON.parse(raw) as SavedView[]) : []);
    } catch {
      setViews([]);
    }
    setHydrated(true);
  }, [storageKey]);

  function persist(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage full/unavailable — the in-memory state still reflects the
      // change for this page load, just won't survive a refresh.
    }
  }

  function onSave() {
    const name = window.prompt("Name this filter view:");
    if (!name || !name.trim()) return;
    const query = searchParams.toString();
    const next = [...views.filter((v) => v.name !== name.trim()), { name: name.trim(), query }];
    persist(next);
  }

  function onDelete(name: string) {
    persist(views.filter((v) => v.name !== name));
  }

  if (!hydrated) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
      {views.map((v) => (
        <span key={v.name} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-card pl-2.5 pr-1 py-0.5">
          <Link href={v.query ? `${pathname}?${v.query}` : pathname} className="text-fg hover:underline">
            {v.name}
          </Link>
          <button
            type="button"
            onClick={() => onDelete(v.name)}
            aria-label={`Delete saved view ${v.name}`}
            className="rounded-full px-1 text-fg-subtle hover:bg-bad-bg hover:text-bad"
          >
            ×
          </button>
        </span>
      ))}
      <button type="button" onClick={onSave} className="rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-fg-muted hover:text-fg">
        + Save current filters
      </button>
    </div>
  );
}
