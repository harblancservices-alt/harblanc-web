"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "../../_lib/store";
import { EmptyState, PAGE_WIDTH, PageHeader, TEXT } from "../../_design/ui";
import { IconShield } from "../../_design/icons";

const TABS: { href: string; label: string; exact: boolean }[] = [
  { href: "/crm-design/admin", label: "Overview", exact: true },
  { href: "/crm-design/admin/accounts", label: "Accounts", exact: false },
  { href: "/crm-design/admin/activity", label: "Activity Log", exact: false },
  { href: "/crm-design/admin/documents", label: "Documents", exact: false },
  { href: "/crm-design/admin/organization", label: "Organization", exact: false },
];

/**
 * Admin Account shell — owner/admin only. In the real CRM this gate is
 * server-enforced (requireCrmAdmin + a re-check in every server action,
 * CRM_MASTER_AUDIT.md §3); this prototype has no server, so this is a
 * client-side visual stand-in for that same gate, not a real permission
 * boundary — documented in DESIGN_DECISIONS.md.
 *
 * Structural fix vs. the real CRM: this whole section renders at FULL
 * width/weight in the nav (see (app)/layout.tsx), not demoted into footer
 * chrome — CRM_MASTER_AUDIT.md §1/§2/§13 P1#8. A 5th tab, Activity Log
 * (renamed from "Activity" to avoid colliding with the sales Activity Feed
 * — §12/§14), is a REAL audit trail here, unlike the real CRM where admin
 * actions are never logged at all.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { currentUser } = useStore();
  const isElevated = currentUser.role === "owner" || currentUser.role === "admin";

  if (!isElevated) {
    return (
      <div className={PAGE_WIDTH}>
        <EmptyState
          icon={<IconShield />}
          title="Admin Account is owner/admin only"
          body="You're viewing this as a Sales Agent. Use the account menu's 'Switch view' to preview it as Brent Harbin (Owner) or Marcus Reyes (Admin)."
        />
      </div>
    );
  }

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title="Admin Account"
        subtitle="Owner/admin-only. Manage the team, review the audit trail, and set organization-wide settings."
      />
      <div role="tablist" aria-label="Admin Account sections" className="mb-4 flex gap-1 overflow-x-auto rounded-[var(--cd-radius-md)] border border-[var(--cd-border)] bg-[var(--cd-surface-2)] p-1.5">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={active}
              className={`shrink-0 rounded-[var(--cd-radius-sm)] px-3.5 py-2 text-[13px] font-bold transition-all ${
                active
                  ? "bg-[var(--cd-surface)] text-[var(--cd-admin)] shadow-[var(--cd-shadow-sm)] ring-1 ring-[var(--cd-border-strong)]"
                  : "text-[var(--cd-text-muted)] hover:text-[var(--cd-text)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
