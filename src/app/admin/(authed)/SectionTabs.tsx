import Link from "next/link";

export type SectionTab = {
  label: string;
  href: string;
  count?: number;
  active?: boolean;
};

/**
 * Two-tab horizontal control used at the top of admin list views to switch
 * between Active and Trash. Active tab is unmistakable: red top border,
 * lifted neutral-900 surface, bigger red marker, white semibold label.
 * Inactive tabs sit recessed against the page bg with neutral-400 text
 * and lift to match the active surface on hover.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <nav
      aria-label="Section tabs"
      className="flex border-b border-neutral-800"
    >
      {tabs.map((tab, i) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={
            "flex flex-1 items-center justify-between gap-3 border-t-2 px-4 py-3 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors sm:px-5 " +
            (i > 0 ? "border-l border-l-neutral-800 " : "") +
            (tab.active
              ? "border-t-red-600 bg-neutral-900 font-semibold text-white "
              : "border-t-transparent bg-neutral-950 text-neutral-400 hover:bg-neutral-900 hover:text-white ")
          }
        >
          <span className="flex items-center gap-2.5">
            {tab.active ? (
              <span
                aria-hidden
                className="inline-block h-3.5 w-[3px] shrink-0 bg-red-600"
              />
            ) : null}
            <span>{tab.label}</span>
          </span>
          {typeof tab.count === "number" ? (
            <span
              className={
                "shrink-0 font-mono text-[11px] tracking-[0.14em] " +
                (tab.active ? "text-white" : "text-neutral-500")
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
