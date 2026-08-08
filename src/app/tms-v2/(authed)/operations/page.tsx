import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { QuotesTab } from "./_components/QuotesTab";
import { ApplicationsTab } from "./_components/ApplicationsTab";
import { AccountingTab } from "./_components/AccountingTab";

// Money-affecting, urgency-affecting data — read fresh every visit,
// matches Today's/Loads'/Brokers' pattern.
export const dynamic = "force-dynamic";

const TABS = [
  { key: "quotes", label: "Quote requests" },
  { key: "applications", label: "Applications" },
  { key: "accounting", label: "Accounting summary" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(v: string): v is TabKey {
  return TABS.some((t) => t.key === v);
}

/**
 * Operations hub — the lead-to-cash pipeline (v2-design.md §13,
 * v2-architecture.md §5's `?tab=`-driven pattern, mirroring /admin's
 * existing Operations hub). Three tabs, one Server Component fetch each —
 * only the active tab's loader runs per request, same as /admin's
 * `OperationsTabs`.
 *
 * The revenue workflow (estimate → finalized quote → BOL → payment) lives
 * on this route's detail page (Phase 5B) — the hub itself stays a read
 * list/filter surface, matching /admin's own hub/detail split.
 */
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawTab = typeof sp.tab === "string" ? sp.tab : "quotes";
  const tab: TabKey = isTabKey(rawTab) ? rawTab : "quotes";
  const page = typeof sp.page === "string" ? Math.max(1, Number(sp.page) || 1) : 1;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const opage = typeof sp.opage === "string" ? Math.max(1, Number(sp.opage) || 1) : 1;
  const ppage = typeof sp.ppage === "string" ? Math.max(1, Number(sp.ppage) || 1) : 1;

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Operations"
            description="The lead-to-cash pipeline — quote requests, applications, and accounting, in one place."
          />

          <nav className="flex w-fit items-center gap-1 rounded-lg bg-elevated p-1">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/tms-v2/operations?tab=${t.key}`}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === t.key ? "bg-card text-fg shadow-e1" : "text-fg-muted hover:text-fg"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </>
      }
    >
      {tab === "quotes" ? <QuotesTab page={page} status={status} /> : null}
      {tab === "applications" ? <ApplicationsTab page={page} /> : null}
      {tab === "accounting" ? <AccountingTab outstandingPage={opage} paymentsPage={ppage} /> : null}
    </PageScroll>
  );
}
