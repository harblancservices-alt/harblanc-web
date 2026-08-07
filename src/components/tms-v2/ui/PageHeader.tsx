import type { ReactNode } from "react";

/**
 * /tms-v2's page header — see Button.tsx's header comment for why this
 * lives under components/tms-v2/ui rather than colliding with /admin's
 * existing components/ui/PageHeader (a differently-shaped, admin-specific
 * two-row breadcrumb/avatar/search header).
 *
 * Brent's explicit ask: no header, no header border, anywhere in /tms-v2 —
 * pages should open straight into their content (KPIs/list), not a big
 * title + description block. `title`/`description` are kept as props
 * (every call site still passes them, and dropping the props would mean
 * editing every page) but are intentionally NOT rendered — this is the one
 * shared component every page's header funnels through, so removing the
 * title/description block here removes it everywhere at once, per-page
 * edits are exactly what this avoids. `badge` and `actions` (period nav,
 * Add/Export buttons, demo-mode indicators, etc.) are real functionality,
 * not chrome, so they still render — just in a plain, borderless row with
 * no bar/background, not attached to a title that no longer exists. */
type PageHeaderProps = {
  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ badge, actions }: PageHeaderProps) {
  if (!badge && !actions) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {badge}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
