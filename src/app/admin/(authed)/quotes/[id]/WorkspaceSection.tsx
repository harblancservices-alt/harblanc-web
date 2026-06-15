import type { ReactNode } from "react";

/**
 * WorkspaceSection — dark-chrome section panel for the V2 Load workspace.
 *
 * Renders a small dark header bar (`bg-panel`, zinc-800 border)
 * with an uppercase eyebrow title + optional badge, then a content
 * surface that defaults to white. The body's white background is
 * INTENTIONAL: the legacy V3 tab components mounted inside expect a
 * light surface and use `text-fg`/`bg-[#fafaf6]` cards.
 *
 * This is the Phase A transitional pattern — dark outer wrapper, light
 * inner content. Phase B will port the inner content to dark; this
 * component then changes its body to `bg-canvas` and we drop the
 * surrounding light surface entirely.
 */
export function WorkspaceSection({
  title,
  badge,
  meta,
  children,
}: {
  title: string;
  /** Optional small right-aligned element (count, status, etc.). */
  badge?: ReactNode;
  /** Optional small inline meta text under the title row, e.g. "Auto-saves on edit". */
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-fg">
            {title}
          </h2>
          {meta ? (
            <p className="mt-[2px] truncate font-mono text-[9px] text-fg-subtle">
              {meta}
            </p>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <div className="bg-card text-fg">{children}</div>
    </section>
  );
}
