import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatTimestampShort, isNew } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Applications",
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string;
  equipment_type: string;
  cdl_status: string;
  years_experience: string | null;
  home_base: string | null;
};

async function loadApplications(): Promise<Row[]> {
  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("applications")
    .select(
      "id, created_at, name, phone, email, equipment_type, cdl_status, years_experience, home_base",
    )
    .order("created_at", { ascending: false });
  return (data ?? []) as Row[];
}

const colSpec =
  "grid grid-cols-[180px_minmax(140px,1fr)_140px_minmax(160px,1fr)_120px_100px_90px_140px] gap-x-3";

export default async function ApplicationsPage() {
  const rows = await loadApplications();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex items-baseline justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Applications
          </p>
          <h1 className="mt-2 text-2xl font-display tracking-tight text-white sm:text-3xl">
            Owner-operator applications
          </h1>
        </div>
        <span className="font-mono text-[11px] tracking-[0.18em] text-neutral-500 uppercase">
          {rows.length}{" "}
          {rows.length === 1 ? "application" : "applications"}
        </span>
      </header>

      {rows.length === 0 ? (
        <p className="mt-12 text-sm text-neutral-500">
          No incoming applications.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[1120px]">
            <div className={`${colSpec} border-b border-neutral-800 px-3 py-2.5`}>
              <Th>Received</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Equipment</Th>
              <Th>CDL</Th>
              <Th>Years</Th>
              <Th>Home base</Th>
            </div>
            <div className="divide-y divide-neutral-900">
              {rows.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/applications/${r.id}`}
                  className={`${colSpec} items-center px-3 py-2.5 transition-colors hover:bg-neutral-900`}
                >
                  <span className="flex items-center gap-2 font-mono text-xs text-neutral-300">
                    {isNew(r.created_at) ? (
                      <span className="font-mono text-[9px] tracking-[0.22em] text-red-500 uppercase">
                        New
                      </span>
                    ) : null}
                    <span>{formatTimestampShort(r.created_at)}</span>
                  </span>
                  <span className="truncate text-sm font-semibold text-white">
                    {r.name}
                  </span>
                  <span className="font-mono text-xs text-neutral-300">
                    {r.phone}
                  </span>
                  <span className="truncate text-xs text-neutral-300">
                    {r.email}
                  </span>
                  <span className="truncate text-sm text-neutral-300">
                    {r.equipment_type}
                  </span>
                  <span className="text-sm text-neutral-300">
                    {r.cdl_status}
                  </span>
                  <span className="font-mono text-xs text-neutral-300">
                    {r.years_experience ?? "\u2014"}
                  </span>
                  <span className="truncate text-xs text-neutral-300">
                    {r.home_base ?? "\u2014"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
      {children}
    </span>
  );
}
