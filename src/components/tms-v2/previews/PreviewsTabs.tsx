"use client";

import Link from "next/link";

/**
 * Segmented switcher between /tms-v2's two preview tools — mirrors
 * /admin/previews' PreviewTabs chrome so the pattern reads the same in
 * both apps, but is its own component (tms-v2 doesn't import admin's).
 */
export function PreviewsTabs({ active }: { active: "email" | "pages" }) {
  const tabs = [
    { key: "email", label: "Email Previews", href: "/tms-v2/previews/email" },
    { key: "pages", label: "Page Previews", href: "/tms-v2/previews/pages" },
  ] as const;

  return (
    <nav
      aria-label="Preview tools"
      className="flex w-fit items-stretch overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            className={
              "px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors " +
              (isActive ? "bg-card text-fg shadow-e1" : "text-fg-subtle hover:text-fg")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
