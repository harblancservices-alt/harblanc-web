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
  const activeColor = tone === "admin" ? "text-[var(--cd-admin)]" : "text-[var(--cd-accent)]";
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
          className={`flex shrink-0 items-center gap-1.5 rounded-[var(--cd-radius-sm)] px-3.5 py-2 text-[13px] font-bold transition-all ${
            active === t.key
              ? `bg-[var(--cd-surface)] shadow-[var(--cd-shadow-sm)] ring-1 ring-[var(--cd-border-strong)] ${activeColor}`
              : "text-[var(--cd-text-muted)] hover:text-[var(--cd-text)]"
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
