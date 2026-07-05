import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { OperationsTabs, type OperationsTab } from "./OperationsTabs";
import { QuotesPanel } from "./QuotesPanel";
import { ApplicationsPanel } from "./ApplicationsPanel";
import { AccountingPanel } from "./AccountingPanel";

export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

/**
 * Operations hub — one page, three tabs.
 *
 * Consolidates the former standalone /admin/quotes, /admin/applications, and
 * /admin/accounting list pages into a single tabbed workspace. Tab selection
 * is URL-driven (`?tab=quotes|applications|accounting`, default quotes) so
 * every tab is deep-linkable and the browser back button walks between them.
 *
 * Each tab's data logic moved untouched into its Panel component; only the
 * active tab's loaders run per request (searchParams keeps this page dynamic),
 * so switching tabs re-queries fresh and, e.g., the Accounting tab's live
 * Stripe calls only fire when that tab is open. The old routes 307-redirect
 * here; the detail and trash sub-pages (quotes/[id], quotes/trash,
 * applications/[id], applications/trash) are untouched.
 */

const TAB_LABEL: Record<OperationsTab, string> = {
  quotes: "Quotes",
  applications: "Applications",
  accounting: "Accounting",
};

function normalizeTab(raw: string | string[] | undefined): OperationsTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "applications" || v === "accounting") return v;
  return "quotes";
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const tab = normalizeTab((await searchParams).tab);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <PageHeader
          eyebrow="Operations"
          title={TAB_LABEL[tab]}
          className="mb-4"
        />

        <OperationsTabs active={tab} />

        <div className="mt-5">
          {tab === "quotes" ? (
            <QuotesPanel />
          ) : tab === "applications" ? (
            <ApplicationsPanel />
          ) : (
            <AccountingPanel />
          )}
        </div>
      </div>
    </div>
  );
}
