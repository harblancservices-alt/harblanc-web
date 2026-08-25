import { requireCrmAdmin } from "./guard";
import { createCrmServerClient } from "@/lib/crm/auth";
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
  const supabase = await createCrmServerClient();

  // OTR's tab badge — its own new/ready-for-approval funnel.
  const { count: otrNeedsAttention } = await supabase
    .from("crm_otr_entries")
    .select("id", { count: "exact", head: true })
    .in("status", ["new", "ready_for_approval"])
    .is("deleted_at", null);

  // BOL Center's tab badge — new or explicitly flagged rows in the review
  // queue; 'ready' isn't included here since it's a normal, expected resting
  // state (both sides resolved), not something needing the admin's attention.
  const { count: bolNeedsAttention } = await supabase
    .from("crm_bol_entries")
    .select("id", { count: "exact", head: true })
    .in("status", ["new", "needs_review"])
    .is("deleted_at", null);

  return (
    // No title/subtitle: the tab row IS the section header, and the heading
    // above it was a line of text nobody needed on every page of the section
    // (Brent, 2026-08-25 — he wanted the vertical space back). PageShell
    // renders nothing at all when both are omitted, so the tabs sit at the
    // top of the content area with the shell's normal padding.
    <PageShell>
      <AdminTabs otrNeedsAttention={otrNeedsAttention ?? 0} bolNeedsAttention={bolNeedsAttention ?? 0} />
      {children}
    </PageShell>
  );
}
