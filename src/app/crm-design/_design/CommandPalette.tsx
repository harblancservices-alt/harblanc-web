"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../_lib/store";
import { IconBuilding, IconContacts, IconSearch, IconSettings, IconShield, IconX } from "./icons";
import { TEXT } from "./ui";

type Row = { id: string; icon: React.ReactNode; label: string; sub: string; href: string; group: string };

/**
 * Global Cmd/Ctrl+K search — companies, contacts, and (owner-view only)
 * team accounts, plus a few fixed jump targets. One search surface for the
 * whole workspace, directly answering the audit's "two different search
 * UIs for the same question" finding (CRM_MASTER_AUDIT.md §5).
 */
export function CommandPalette() {
  const { companies, contacts, team, paletteOpen, setPaletteOpen, currentUser } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isOwner = currentUser.role === "owner" || currentUser.role === "admin";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 10);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [paletteOpen]);

  const rows = useMemo<Row[]>(() => {
    const companyRows: Row[] = companies.map((c) => ({
      id: c.id,
      icon: <IconBuilding width={15} height={15} />,
      label: c.name,
      sub: `${c.city}, ${c.state} · Company`,
      href: `/crm-design/companies/${c.id}`,
      group: "Companies",
    }));
    const contactRows: Row[] = contacts.map((c) => ({
      id: c.id,
      icon: <IconContacts width={15} height={15} />,
      label: c.name,
      sub: `${c.title} · Contact`,
      href: `/crm-design/contacts/${c.id}`,
      group: "Contacts",
    }));
    const teamRows: Row[] = isOwner
      ? team.map((m) => ({
          id: m.id,
          icon: <IconShield width={15} height={15} />,
          label: m.name,
          sub: `${m.title} · Team account`,
          href: `/crm-design/admin/accounts/${m.id}`,
          group: "Admin",
        }))
      : [];
    return [...companyRows, ...contactRows, ...teamRows];
  }, [companies, contacts, team, isOwner]);

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return rows.slice(0, 8);
    return rows.filter((r) => r.label.toLowerCase().includes(trimmed) || r.sub.toLowerCase().includes(trimmed)).slice(0, 12);
  }, [q, rows]);

  if (!paletteOpen) return null;

  return (
    <div
      className="cd-animate-fade fixed inset-0 z-[150] flex items-start justify-center bg-black/45 px-4 pt-[12vh]"
      onClick={() => setPaletteOpen(false)}
      role="presentation"
    >
      <div
        className="cd-animate-rise w-full max-w-lg overflow-hidden rounded-[var(--cd-radius-lg)] border border-[var(--cd-border)] bg-[var(--cd-surface)] shadow-[var(--cd-shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--cd-border)] px-4 py-3">
          <IconSearch width={17} height={17} className="text-[var(--cd-text-subtle)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies, contacts, or (Admin) team accounts…"
            className="h-6 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--cd-text-subtle)]"
          />
          <button
            type="button"
            onClick={() => setPaletteOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--cd-text-subtle)] hover:bg-[var(--cd-surface-2)]"
          >
            <IconX width={14} height={14} />
          </button>
        </div>
        <div className="cd-scroll max-h-[52vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className={`px-4 py-8 text-center ${TEXT.micro} text-[var(--cd-text-subtle)]`}>No matches.</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.group + r.id}
                type="button"
                onClick={() => {
                  setPaletteOpen(false);
                  router.push(r.href);
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--cd-surface-hover)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--cd-radius-sm)] bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)]">
                  {r.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{r.label}</span>
                  <span className={`block truncate ${TEXT.micro} text-[var(--cd-text-muted)]`}>{r.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--cd-border)] px-4 py-2 text-[11px] text-[var(--cd-text-subtle)]">
          <span>↵ open</span>
          <span>esc close</span>
          <span className="ml-auto flex items-center gap-1">
            <IconSettings width={12} height={12} /> ⌘K anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
