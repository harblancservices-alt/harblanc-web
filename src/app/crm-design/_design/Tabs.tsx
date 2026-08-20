"use client";

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  tone = "accent",
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
  tone?: "accent" | "admin";
}) {
  // View-only — switches content or narrows a list, never writes a record
  // (that's SegmentedControl mode="field", see _design/ui.tsx). Deliberately
  // quiet: "current tab" reads through WEIGHT + a thin underline in the
  // section's tone, not through filling the tab with that tone's color —
  // so it never competes with the one real CTA on the same screen for
  // attention. See CRM_INTERACTION_HIERARCHY.md §6/§10 decision 1.
  const underline = tone === "admin" ? "border-[var(--cd-admin)]" : "border-[var(--cd-accent)]";
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] p-1.5"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-[var(--cd-radius-sm)] border-b-2 px-3.5 py-2 text-[13px] font-bold transition-all ${
            active === t.key
              ? `border-b-2 bg-[var(--cd-surface)] text-[var(--cd-text)] shadow-[var(--cd-shadow-sm)] ring-1 ring-[var(--cd-border-strong)] ${underline}`
              : "border-transparent text-[var(--cd-text-muted)] hover:text-[var(--cd-text)]"
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span
              className={`rounded-full px-1.5 text-[10.5px] font-bold ${
                active === t.key ? "bg-[var(--cd-surface-2)]" : "bg-[var(--cd-border)]"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
