import Link from "next/link";

export type SectionTab = {
  label: string;
  href: string;
  count?: number;
  active?: boolean;
};

/**
 * Two-tab horizontal control used at the top of admin list views (Active /
 * Trash). V2 "Fleet Ops" secondary tab: the active tab carries the accent
 * underline + ink text, inactive tabs are muted ink-3 and lift toward ink on
 * hover. Sits below the raised primary Operations tabs as the lighter-weight
 * secondary switch.
 *
 * Shared by Quotes + Applications list/trash pages.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav aria-label="Section tabs" className="flex border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={
            "-mb-px inline-flex items-center gap-2 border-b-[3px] px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] transition-colors " +
            (tab.active
              ? "border-accent text-ink"
              : "border-transparent text-ink-3 hover:text-ink")
          }
        >
          <span>{tab.label}</span>
          {typeof tab.count === "number" ? (
            <span
              className={
                "font-mono text-[10px] font-bold tabular-nums " +
                (tab.active ? "text-accent" : "text-ink-3")
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
