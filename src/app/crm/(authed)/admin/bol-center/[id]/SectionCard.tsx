import type { ReactNode } from "react";

/**
 * Page-scoped section wrapper for the BOL detail page's visual-hierarchy
 * pass (Brent, approved 2026-08-21) — NOT the shared _shell/ui.tsx Card/
 * CardHead. Deliberately not routed through those: Card hardcodes a plain
 * `border` (1px) utility and CardHead hardcodes `border-b border-line`, and
 * appending a conflicting border-width/color utility on top via className
 * risks losing to Tailwind's own generated-source-order cascade instead of
 * composing cleanly and predictably. Editing Card/CardHead themselves was
 * explicitly out of scope (both are shared sitewide). This local component
 * reuses only existing .crm-light tokens — border-line-strong, bg-inset,
 * bg-accent, text-fg/-muted — at the specific weights this page's pass
 * calls for: a heavier 1.75px outer border so each section reads as its own
 * distinct block, plus a 3px left accent bar and a border-line-strong
 * divider under the header title.
 */
export function SectionCard({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border-[1.75px] border-line-strong bg-card shadow-e2">
      <div className="flex items-stretch">
        <span aria-hidden className="w-[3px] shrink-0 bg-accent" />
        <div className="flex flex-1 items-center justify-between gap-3 border-b border-line-strong bg-inset px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-bold tracking-tight text-fg">{title}</h2>
            {hint && <p className="truncate text-[11.5px] font-medium text-fg-muted">{hint}</p>}
          </div>
          {right}
        </div>
      </div>
      {children}
    </div>
  );
}
