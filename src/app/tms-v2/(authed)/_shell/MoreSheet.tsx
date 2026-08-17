"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { moreNavSections, isNavItemActive, type MoreSectionId } from "@/lib/nav/nav.config";
import { IconChevronRight } from "@/lib/nav/icons";

/** Icon-badge tint per More-sheet section (approved option-B design) —
 * green for money, blue for day-to-day ops, slate for records/reference.
 * Reuses the same status-chip tokens (`ok`/`steel`/`slate` + their `-bg`
 * pairs) already used for badges elsewhere in tms-v2, not the solid
 * `--v2-blue` action-button color. */
const SECTION_BADGE_CLASS: Record<MoreSectionId, string> = {
  money: "bg-ok-bg text-ok",
  operate: "bg-steel-bg text-steel",
  records: "bg-slate-bg text-slate",
};

/**
 * Mobile "More" popover — pops up from the bottom-nav's More button,
 * mirroring legacy /admin's mobile MoreSheet interaction (a compact,
 * bottom-anchored panel over a dimmed backdrop) rather than the previous
 * full-screen inset-0 takeover. Per Brent's mobile review: the Search /
 * "Notifications — coming soon" / "Quick add — coming soon" rows and
 * their divider are gone entirely — the panel is grouped into colored
 * sections (moreNavSections(), built from the same array the desktop
 * sidebar reads — every item keeps its existing href/behavior) plus the
 * account email + Sign out at the bottom. Dismisses on backdrop tap,
 * Escape, or selecting a destination. Desktop is untouched (this
 * component only ever renders `lg:hidden`, via BottomNav).
 */
export function MoreSheet({ open, onClose, email }: { open: boolean; onClose: () => void; email: string | null }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const sections = moreNavSections();

  return (
    <div role="dialog" aria-modal="true" aria-label="More" className="fixed inset-0 z-50 lg:hidden">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 touch-none bg-black/40" />
      <div
        className="absolute inset-x-3 bottom-20 flex max-h-[75vh] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-e3"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="no-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto p-2">
          {sections.map((section, sectionIndex) => (
            <div key={section.id} className={sectionIndex > 0 ? "mt-3" : undefined}>
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-fg">
                {section.label}
              </p>
              <div className="divide-y divide-line">
                {section.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      prefetch={false}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2.5 text-[15px] ${
                        active ? "font-semibold text-accent" : "font-medium text-fg"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${SECTION_BADGE_CLASS[section.id]}`}
                      >
                        <item.Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      <IconChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line px-4 py-3">
          {email ? <p className="mb-2 truncate text-[13px] text-fg-muted">{email}</p> : null}
          <form action="/tms-v2/logout" method="post">
            <button type="submit" className="text-[13px] font-semibold text-bad">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
