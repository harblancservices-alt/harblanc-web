import Link from "next/link";

export type SectionTab = {
  label: string;
  href: string;
  count?: number;
  active?: boolean;
};

/**
 * Two-tab horizontal control used at the top of admin list views.
 * Level 6.3 admin palette: text-only tabs with a thick black underline
 * on the active one. No decorative red, no lifted-card pattern.
 *
 * Shared by Quotes + Applications list/trash pages. The same V3 style
 * lands on Applications pages "for free" via this component.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav
      aria-label="Section tabs"
      className="flex border-b border-black"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={
            "inline-flex items-center gap-2 px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-black transition-colors -mb-px border-b-[3px] " +
            (tab.active
              ? "border-black"
              : "border-transparent hover:opacity-70")
          }
        >
          <span>{tab.label}</span>
          {typeof tab.count === "number" ? (
            <span
              className={
                "font-mono text-[10px] font-bold tabular-nums " +
                (tab.active ? "text-black" : "text-black/55")
              }
            >
              {tab.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
