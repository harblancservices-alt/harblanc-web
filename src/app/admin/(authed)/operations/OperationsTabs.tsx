import Link from "next/link";

/**
 * Operations hub tab bar — URL-driven, raised "button" tabs.
 *
 * Reuses the raised-tab visual from the Reach page (Send / Contacts): a
 * pill-track with the active tab lifted a hair, bordered, and accent-colored.
 * Unlike Reach's client-state tabs these are real <Link>s carrying `?tab=`, so
 * every tab is deep-linkable and the browser back button walks between them.
 *
 * Rendered as a server component — the active tab is a prop, so no client
 * state is needed. prefetch={false} matches the rest of the admin chrome
 * (the middleware re-issues session cookies on every request, which the
 * router cache won't store).
 */

export type OperationsTab = "quotes" | "applications" | "accounting";

const TABS: { key: OperationsTab; label: string }[] = [
  { key: "quotes", label: "Quotes" },
  { key: "applications", label: "Applications" },
  { key: "accounting", label: "Accounting" },
];

export function OperationsTabs({ active }: { active: OperationsTab }) {
  return (
    <nav
      aria-label="Operations sections"
      className="flex w-full max-w-md gap-1 rounded-lg border border-line bg-inset p-1 shadow-e1"
    >
      {TABS.map((tab) => {
        const on = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/admin/operations?tab=${tab.key}`}
            prefetch={false}
            aria-current={on ? "page" : undefined}
            className={
              "flex-1 rounded-md py-2 text-center text-[12px] font-bold uppercase tracking-[0.06em] transition-all sm:text-[13px] sm:tracking-[0.08em] " +
              (on
                ? "-translate-y-px border border-line-strong bg-card text-accent shadow-e2"
                : "border border-transparent text-ink-3 hover:text-ink")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
