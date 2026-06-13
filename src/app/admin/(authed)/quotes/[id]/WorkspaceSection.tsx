import type { ReactNode } from "react";

/**
 * WorkspaceSection — dark-chrome section panel for the V2 Load workspace.
 *
 * Renders a small dark header bar (`bg-zinc-900/60`, zinc-800 border)
 * with an uppercase eyebrow title + optional badge, then a content
 * surface that defaults to white. The body's white background is
 * INTENTIONAL: the legacy V3 tab components mounted inside expect a
 * light surface and use `text-black`/`bg-[#fafaf6]` cards.
 *
 * This is the Phase A transitional pattern — dark outer wrapper, light
 * inner content. Phase B will port the inner content to dark; this
 * component then changes its body to `bg-zinc-950` and we drop the
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
    <section className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-200">
            {title}
          </h2>
          {meta ? (
            <p className="mt-[2px] truncate font-mono text-[9px] text-zinc-500">
              {meta}
            </p>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <div className="bg-white text-black">{children}</div>
    </section>
  );
}
