import type { ReactNode } from "react";

/**
 * /tms-v2's page header — see Button.tsx's header comment for why this
 * lives under components/tms-v2/ui rather than colliding with /admin's
 * existing components/ui/PageHeader (a differently-shaped, admin-specific
 * two-row breadcrumb/avatar/search header).
 */
type PageHeaderProps = {
  title: string;
  description?: string;
  /** Small pill next to the title — used for the "V2 — preview" marker and
   * similar one-off callouts. Not a status pill (see <StatusPill>). */
  badge?: ReactNode;
  actions?: ReactNode;
};

/** Page-level heading: title (+ optional description/badge) left, primary
 * actions right. Every /tms-v2 page shell uses this instead of ad hoc
 * heading markup. */
export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold text-fg">{title}</h1>
          {badge}
        </div>
        {description ? <p className="text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
