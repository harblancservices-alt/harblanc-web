import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  formatTimestampShort,
  isNew,
  todayStartISO,
  sevenDaysAgoISO,
} from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Dispatch center",
  robots: { index: false, follow: false },
};

type QuoteRecent = {
  id: string;
  created_at: string;
  name: string;
  commodity: string;
  weight: string;
};

type AppRecent = {
  id: string;
  created_at: string;
  name: string;
  equipment_type: string;
  cdl_status: string;
};

async function loadDashboard() {
  const sb = createServiceRoleClient();
  const todayISO = todayStartISO();
  const weekISO = sevenDaysAgoISO();

  const [
    { count: quoteTotal },
    { count: quoteToday },
    { count: quoteWeek },
    { count: appTotal },
    { count: appToday },
    { count: appWeek },
    { data: recentQuotes },
    { data: recentApps },
  ] = await Promise.all([
    sb.from("quote_requests").select("*", { count: "exact", head: true }),
    sb
      .from("quote_requests")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO),
    sb
      .from("quote_requests")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekISO),
    sb.from("applications").select("*", { count: "exact", head: true }),
    sb
      .from("applications")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayISO),
    sb
      .from("applications")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekISO),
    sb
      .from("quote_requests")
      .select("id, created_at, name, commodity, weight")
      .order("created_at", { ascending: false })
      .limit(6),
    sb
      .from("applications")
      .select("id, created_at, name, equipment_type, cdl_status")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  return {
    quoteTotal: quoteTotal ?? 0,
    quoteToday: quoteToday ?? 0,
    quoteWeek: quoteWeek ?? 0,
    appTotal: appTotal ?? 0,
    appToday: appToday ?? 0,
    appWeek: appWeek ?? 0,
    recentQuotes: (recentQuotes ?? []) as QuoteRecent[],
    recentApps: (recentApps ?? []) as AppRecent[],
  };
}

export default async function DashboardPage() {
  const d = await loadDashboard();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
        Overview
      </p>
      <h1 className="mt-2 text-2xl font-display tracking-tight text-white sm:text-3xl">
        Dispatch center
      </h1>

      {/* Summary blocks with NEW TODAY / THIS WEEK */}
      <div className="mt-6 grid grid-cols-1 border border-neutral-800 md:grid-cols-2">
        <SummaryBlock
          label="Quote requests"
          total={d.quoteTotal}
          newToday={d.quoteToday}
          thisWeek={d.quoteWeek}
          href="/admin/quotes"
        />
        <SummaryBlock
          label="Applications"
          total={d.appTotal}
          newToday={d.appToday}
          thisWeek={d.appWeek}
          href="/admin/applications"
          divider
        />
      </div>

      {/* Recent activity event logs */}
      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <EventLog
          title="Recent quote requests"
          basePath="/admin/quotes"
          emptyText="No active quote requests."
          rows={d.recentQuotes.map((r) => ({
            id: r.id,
            created_at: r.created_at,
            name: r.name,
            meta: [r.commodity, r.weight].filter(Boolean).join(" \u00b7 "),
          }))}
        />
        <EventLog
          title="Recent applications"
          basePath="/admin/applications"
          emptyText="No incoming applications."
          rows={d.recentApps.map((r) => ({
            id: r.id,
            created_at: r.created_at,
            name: r.name,
            meta: [r.equipment_type, r.cdl_status].filter(Boolean).join(" \u00b7 "),
          }))}
        />
      </div>
    </div>
  );
}

function SummaryBlock({
  label,
  total,
  newToday,
  thisWeek,
  href,
  divider = false,
}: {
  label: string;
  total: number;
  newToday: number;
  thisWeek: number;
  href: string;
  divider?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "block px-5 py-6 transition-colors hover:bg-neutral-900 " +
        (divider
          ? "border-t border-neutral-800 md:border-t-0 md:border-l "
          : "")
      }
    >
      <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
        {label}
      </p>
      <p className="mt-3 font-mono text-4xl tracking-tight text-white">
        {total}
      </p>
      <p className="mt-3 font-mono text-[10px] tracking-[0.18em] text-neutral-500 uppercase">
        <span className={newToday > 0 ? "text-red-500" : "text-neutral-500"}>
          {newToday}
        </span>{" "}
        new today
        <span aria-hidden className="mx-2 text-neutral-700">
          ·
        </span>
        <span className={thisWeek > 0 ? "text-white" : "text-neutral-500"}>
          {thisWeek}
        </span>{" "}
        this week
      </p>
    </Link>
  );
}

type EventRow = {
  id: string;
  created_at: string;
  name: string;
  meta: string;
};

function EventLog({
  title,
  basePath,
  rows,
  emptyText,
}: {
  title: string;
  basePath: string;
  rows: EventRow[];
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
        {title}
      </h2>
      <ul className="mt-3 divide-y divide-neutral-900 border-y border-neutral-900">
        {rows.length === 0 ? (
          <li className="px-1 py-3 text-sm text-neutral-500">{emptyText}</li>
        ) : (
          rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`${basePath}/${r.id}`}
                className="block px-1 py-2.5 transition-colors hover:bg-neutral-900"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm text-white">
                      {r.name}
                    </span>
                    {isNew(r.created_at) ? (
                      <span className="font-mono text-[9px] tracking-[0.22em] text-red-500 uppercase shrink-0">
                        New
                      </span>
                    ) : null}
                  </div>
                  <span className="font-mono text-[10px] tracking-[0.18em] text-neutral-500 uppercase shrink-0">
                    {formatTimestampShort(r.created_at)}
                  </span>
                </div>
                {r.meta ? (
                  <p className="mt-0.5 truncate font-mono text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                    {r.meta}
                  </p>
                ) : null}
              </Link>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
