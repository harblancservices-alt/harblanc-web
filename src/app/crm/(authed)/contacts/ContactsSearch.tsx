"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Search box for the global Contacts directory. Writes `?q=` into the URL and
 * lets the server component re-query (RLS-scoped) — so the directory stays
 * server-rendered and any search is shareable. Applies on submit (Enter or the
 * button); the Clear affordance appears once a query is active.
 */
export function ContactsSearch({ q }: { q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = search.trim();
    startTransition(() =>
      router.push(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname),
    );
  }

  function clear() {
    setSearch("");
    startTransition(() => router.push(pathname));
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 sm:max-w-md">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts by name, email, title…"
        aria-label="Search contacts"
        className="h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-3 text-[13.5px] text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 shrink-0 items-center rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        Search
      </button>
      {q && (
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center rounded-lg border border-line-strong bg-card px-3 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-inset hover:text-fg disabled:opacity-60"
        >
          Clear
        </button>
      )}
    </form>
  );
}
