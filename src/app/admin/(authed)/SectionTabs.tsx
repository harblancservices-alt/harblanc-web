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
      className="flex border-b border-zinc-200"
    >
      {tabs.map((tab, i) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={
            "flex flex-1 items-center justify-between gap-3 border-t-2 px-4 py-3 text-xs font-semibold tracking-[0.12em] uppercase transition-colors sm:px-5 " +
            (i > 0 ? "border-l border-l-zinc-200 " : "") +
            (tab.active
              ? "border-t-red-600 bg-white font-semibold text-black "
              : "border-t-transparent bg-zinc-50 text-black hover:bg-white hover:text-black ")
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
                "shrink-0 font-mono text-xs tracking-[0.12em] " +
                (tab.active ? "text-black" : "text-black")
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
