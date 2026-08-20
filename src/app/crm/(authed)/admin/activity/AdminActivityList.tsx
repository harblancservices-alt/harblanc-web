"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHead, ZEBRA_ROWS, EmptyState, BTN_EDIT } from "../../_shell/ui";
import { CONTROL } from "../../_shell/form";
import { formatDateTime } from "../../_shell/format";
import { IconSearch, IconContacts } from "../../_shell/icons";
import type { AdminActivityItem } from "../types";

const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "activity", label: "Activity" },
  { key: "call", label: "Calls" },
  { key: "note", label: "Notes" },
] as const;

type TypeKey = (typeof TYPE_TABS)[number]["key"];

function recordHref(item: AdminActivityItem): string | null {
  if (item.accountId) return `/crm/accounts/${item.accountId}`;
  if (item.contactId) return `/crm/contacts/${item.contactId}`;
  return null;
}

const TYPE_BADGE: Record<AdminActivityItem["type"], string> = {
  call: "bg-accent/10 text-accent",
  note: "bg-warn-bg text-warn",
  activity: "bg-steel-bg text-steel",
};

const TYPE_LABEL: Record<AdminActivityItem["type"], string> = {
  call: "Call",
  note: "Note",
  activity: "Activity",
};

/**
 * Client-side filter/search over the org-wide activity feed — same "load
 * once, filter client-side" contract as AllDocumentsListClient
 * (../../active-customers/AllDocumentsListClient.tsx): the org's activity
 * history is bounded (ROW_LIMIT in ../activity-data.ts) and small enough
 * that a per-keystroke round trip isn't worth it. Each row's "View" links to
 * the record it references (the company profile, or the contact when there
 * is no company) — note-type rows show their text inline already, so
 * "View" for those just opens the same linked record where the full note
 * lives, rather than a separate note-reading surface.
 */
export function AdminActivityList({ items }: { items: AdminActivityItem[] }) {
  const [type, setType] = useState<TypeKey>("all");
  const [author, setAuthor] = useState("");
  const [company, setCompany] = useState("");
  const [q, setQ] = useState("");

  const authors = useMemo(() => {
    const names = new Set<string>();
    for (const i of items) if (i.authorName) names.add(i.authorName);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const companies = useMemo(() => {
    const names = new Set<string>();
    for (const i of items) if (i.accountName) names.add(i.accountName);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    return items.filter((i) => {
      if (type !== "all" && i.type !== type) return false;
      if (author && i.authorName !== author) return false;
      if (company && i.accountName !== company) return false;
      if (!trimmed) return true;
      const haystack = [i.title, i.body, i.authorName, i.accountName, i.contactName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [items, type, author, company, q]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-3">
        <label className="relative flex items-center">
          <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 text-fg-subtle" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search activity, notes, calls…"
            className={`h-10 w-full pl-9 ${CONTROL}`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Activity type" className="flex gap-1 rounded-lg border border-line-strong bg-inset p-1">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={type === t.key}
                onClick={() => setType(t.key)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  type === t.key ? "bg-card text-admin shadow-e1 ring-1 ring-line-strong" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select value={author} onChange={(e) => setAuthor(e.target.value)} className={`h-9 ${CONTROL}`}>
            <option value="">All reps</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <select value={company} onChange={(e) => setCompany(e.target.value)} className={`h-9 ${CONTROL}`}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconContacts />}
            title={items.length === 0 ? "No activity yet" : "No activity matches"}
            body={items.length === 0 ? "Actions across every company will show up here." : "Try different filters."}
          />
        </Card>
      ) : (
        <Card>
          <CardHead title="Activity" hint={`${filtered.length} ${filtered.length === 1 ? "event" : "events"}`} />
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {filtered.map((item) => {
              const href = recordHref(item);
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_BADGE[item.type]}`}>
                        {TYPE_LABEL[item.type]}
                      </span>
                      <span className="truncate text-[13.5px] font-semibold text-fg">{item.title}</span>
                    </div>
                    {item.body && (
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg-muted">
                        {item.body}
                      </p>
                    )}
                    <p className="mt-1 text-[12px] text-fg-subtle">
                      {[item.authorName, item.accountName, formatDateTime(item.occurredAt)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {href && (
                    <Link href={href} prefetch={false} className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}>
                      View
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
