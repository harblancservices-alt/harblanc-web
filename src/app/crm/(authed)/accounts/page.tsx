import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, EmptyState } from "../_shell/ui";
import { IconCompanies } from "../_shell/icons";
import { AddCompany } from "./AddCompany";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  lifecycle_status: string | null;
  created_at: string;
};

const LIFECYCLE_TONE: Record<string, string> = {
  lead: "bg-slate-bg text-slate",
  prospect: "bg-steel-bg text-steel",
  customer: "bg-ok-bg text-ok",
  inactive: "bg-warn-bg text-warn",
};

/**
 * Companies list — reads crm_accounts for the caller's org ONLY (RLS-scoped;
 * no dispatch table is ever queried). Empty state prompts the first create.
 */
export default async function CompaniesPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, industry, city, state, phone, lifecycle_status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const accounts = (data ?? []) as AccountRow[];

  return (
    <PageShell
      eyebrow="Book of business"
      title="Companies"
      subtitle={
        accounts.length
          ? `${accounts.length} ${accounts.length === 1 ? "company" : "companies"}`
          : "Carriers and shippers you're working."
      }
      actions={<AddCompany />}
    >
      <Card>
        {accounts.length === 0 ? (
          <EmptyState
            icon={<IconCompanies />}
            title="No companies yet"
            body="Add your first carrier or shipper to start building your pipeline."
            action={<AddCompany />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Stage</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const stage = a.lifecycle_status ?? "lead";
                  const tone = LIFECYCLE_TONE[stage] ?? "bg-slate-bg text-slate";
                  const location = [a.city, a.state].filter(Boolean).join(", ");
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-line last:border-0 transition-colors hover:bg-inset"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/crm/accounts/${a.id}`}
                          prefetch={false}
                          className="font-semibold text-fg hover:text-accent"
                        >
                          {a.name}
                        </Link>
                        {a.industry && (
                          <div className="text-[12px] text-fg-subtle">
                            {a.industry}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-fg-muted">
                        {location || "—"}
                      </td>
                      <td className="px-5 py-3 font-mono text-fg-muted">
                        {a.phone || "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${tone}`}
                        >
                          {stage}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
