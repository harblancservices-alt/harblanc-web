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
/**
 * The OTR and BOL Center attention counts used to be queried here and shown
 * as badges on their tabs. Both tabs came off the row (2026-08-25), so the
 * queries went with them rather than being computed and thrown away.
 *
 * WHAT THAT COSTS: the exact badge number — OTR entries in new/
 * ready_for_approval, BOL entries in new/needs_review — is no longer shown
 * anywhere. Admin → Overview's work list carries an OTR count, but it is a
 * DIFFERENT number (new/researching/ready_for_approval, i.e. everything
 * before release), and its BOL count uses new/needs_review/ready. Close, not
 * equal. See the report.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireCrmAdmin();

  return (
    // No title/subtitle: the tab row IS the section header, and the heading
    // above it was a line of text nobody needed on every page of the section
    // (Brent, 2026-08-25 — he wanted the vertical space back). PageShell
    // renders nothing at all when both are omitted, so the tabs sit at the
    // top of the content area with the shell's normal padding.
    <PageShell>
      <AdminTabs />
      {children}
    </PageShell>
  );
}
