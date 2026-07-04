"use client";

/**
 * Backhaul Reach — Contacts tab. A searchable table of EVERY broker contact
 * ever entered, with an Include on/off toggle (broker_contacts.is_backhaul):
 * whether the contact is used for backhaul reach when their broker is near the
 * pickup. New contacts default Include = ON. Rows zebra-stripe for scannability.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { FarmContactButton } from "../../FarmBrokerContactCard";
import { setContactInclude } from "./actions";
import type { ReachContact } from "./queries";

function lastReachedLabel(days: number | null): string {
  if (days === null) return "Never";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function ContactsTab({
  contacts,
  available,
}: {
  contacts: ReachContact[];
  available: boolean;
}) {
  const [query, setQuery] = useState("");
  // Local override of the Include state so toggling feels instant (optimistic).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());

  const includeOf = (c: ReachContact) =>
    overrides[c.contactId] ?? c.include;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.company, c.area, c.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [contacts, query]);

  async function toggle(c: ReachContact) {
    const next = !includeOf(c);
    setOverrides((o) => ({ ...o, [c.contactId]: next }));
    setPending((p) => new Set(p).add(c.contactId));
    const res = await setContactInclude(c.contactId, next);
    setPending((p) => {
      const s = new Set(p);
      s.delete(c.contactId);
      return s;
    });
    if (!res.ok) {
      // Revert on failure.
      setOverrides((o) => ({ ...o, [c.contactId]: !next }));
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card shadow-e2">
      {/* Toolbar: search + count + add */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, area…"
          className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-inset px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
        />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {filtered.length}
          {filtered.length !== contacts.length ? ` / ${contacts.length}` : ""}{" "}
          contact{contacts.length === 1 ? "" : "s"}
        </span>
        <FarmContactButton />
      </div>

      {!available ? (
        <p className="px-4 py-8 text-center font-mono text-[12px] text-warn">
          Contacts unavailable — check the broker_contacts table.
        </p>
      ) : contacts.length === 0 ? (
        <p className="px-4 py-10 text-center font-mono text-[12px] text-ink-3">
          No contacts yet. Add one with “+ Farm a contact”.
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-4 py-10 text-center font-mono text-[12px] text-ink-3">
          No contacts match “{query.trim()}”.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] text-ink">
            <thead>
              <tr className="bg-inset">
                <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong">
                  Company
                </th>
                <th className="hidden px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong sm:table-cell">
                  Area
                </th>
                <th className="hidden px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong sm:table-cell">
                  Last reached
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3 border-b-2 border-line-strong">
                  Include
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const on = includeOf(c);
                const busy = pending.has(c.contactId);
                return (
                  <tr
                    key={c.contactId}
                    className="border-b border-line odd:bg-card even:bg-inset"
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <span className="font-semibold text-ink">{c.name}</span>
                      {c.email ? (
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-steel">
                          {c.email}
                        </span>
                      ) : (
                        <span className="mt-0.5 block font-mono text-[11px] text-warn">
                          No email
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-middle text-ink-2">
                      {c.company}
                      <span className="mt-0.5 block text-[11px] text-ink-3 sm:hidden">
                        {c.area || "—"} · {lastReachedLabel(c.lastReachedDaysAgo)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 align-middle text-ink-2 sm:table-cell">
                      {c.area || "—"}
                    </td>
                    <td className="hidden px-3 py-2.5 align-middle tabular-nums text-ink-2 sm:table-cell">
                      {lastReachedLabel(c.lastReachedDaysAgo)}
                    </td>
                    <td className="px-3 py-2.5 text-right align-middle">
                      <IncludeToggle on={on} busy={busy} onClick={() => toggle(c)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line px-4 py-2.5 text-[11px] text-ink-3">
        <span className="font-semibold text-ink-2">Include</span> = used for
        backhaul reach when this company sits near your pickup.{" "}
        <Link
          href="/admin/dispatch/brokers"
          prefetch={false}
          className="font-semibold text-steel hover:underline"
        >
          Manage brokers →
        </Link>
      </p>
    </div>
  );
}

function IncludeToggle({
  on,
  busy,
  onClick,
}: {
  on: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={busy}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 " +
        (on
          ? "border-accent bg-accent"
          : "border-line-strong bg-inset")
      }
    >
      <span
        aria-hidden
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-e1 transition-transform " +
          (on ? "translate-x-[22px]" : "translate-x-[3px]")
        }
      />
    </button>
  );
}
