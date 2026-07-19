import Link from "next/link";

/**
 * Segmented switcher between the two preview labs. Same chrome as the
 * segmented controls on the trip / load-board views: an inset pill with
 * the active segment lifted onto a card surface.
 */
export function PreviewTabs({ active }: { active: "standard" | "uniformity" }) {
  const tabs = [
    { key: "standard", label: "Standard", href: "/admin/previews" },
    { key: "uniformity", label: "Email uniformity", href: "/admin/previews-2" },
  ] as const;

  return (
    <nav
      aria-label="Preview labs"
      className="flex w-fit items-stretch overflow-hidden rounded-md border border-line-strong bg-inset shadow-e1"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={
              "px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors " +
              (isActive
                ? "bg-card text-fg shadow-e1"
                : "text-fg-subtle hover:text-fg")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
