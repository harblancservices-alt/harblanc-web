import { requireCrmAdmin } from "./guard";
import { PageShell } from "../_shell/ui";
import { AdminTabs } from "./AdminTabs";

export const dynamic = "force-dynamic";

/**
 * Shell for every /crm/admin/** page — the owner-only "Admin Account"
 * section. requireCrmAdmin() is the page-level gate (redirects a non-owner
 * to /crm before any of this renders); every server action a page/tab calls
 * re-verifies role==='owner' itself too (../admin/actions.ts), so this
 * layout is defense in depth, not the only enforcement point.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireCrmAdmin();

  return (
    <PageShell title="Admin Account" subtitle="Owner-only. Manage the team and review company-wide activity.">
      <AdminTabs />
      {children}
    </PageShell>
  );
}
