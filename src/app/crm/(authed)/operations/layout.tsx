import { PageShell } from "../_shell/ui";
import { OperationsTabs } from "./OperationsTabs";

export const dynamic = "force-dynamic";

/**
 * Shell for every /crm/operations/** page — the day-to-day operating tools.
 *
 * Deliberately UNGATED beyond the section's parent: ../layout.tsx already
 * ran requireCrmUser() (valid session + active crm_profiles membership) for
 * every authed CRM page, and Operations adds no further role requirement —
 * it's visible to every CRM user, sales agents included. That's why there's
 * no guard.ts here mirroring ../admin/guard.ts: adding a second
 * requireCrmUser() call would only buy a duplicate round trip, and there is
 * no owner check to make. The one admin-only piece of this section's story —
 * uploading the org's document templates — stays at /crm/admin/documents,
 * behind requireCrmAdmin() and its own per-action owner re-check.
 */
export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    // No title/subtitle — same call as ../admin/layout.tsx: the tab row is
    // the section header, and the heading above it was repeated on every page
    // of the section for no benefit.
    <PageShell>
      <OperationsTabs />
      {children}
    </PageShell>
  );
}
