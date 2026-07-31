import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState, ZEBRA_ROWS } from "../_shell/ui";
import { IconCustomers } from "../_shell/icons";
import { firstName } from "../_shell/format";
import { digitsForTel } from "../_shell/contactFields";
import { stageLabel, stageTone } from "../accounts/lifecycle";

export const dynamic = "force-dynamic";

type AccountRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  industry: string | null;
  commodities: string | null;
  assigned_user_id: string | null;
};

type ContactRow = {
  id: string;
  account_id: string;
  name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
};

/**
 * Active Customers — every crm_account marked lifecycle_status='customer'
 * via the profile's lifecycle stepper (accounts/[id]/LifecycleControl.tsx →
 * updateLifecycleStatus). Purely a read view: there is no write path here —
 * moving a company in or out of this list is done on its profile, which
 * already exists. Visible to every CRM user, org-scoped by RLS. Sorted
 * alphabetically, since this is a directory to scan for a specific customer
 * rather than a work queue like the dashboard.
 */
export default async function ActiveCustomersPage() {
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_accounts")
    .select("id, name, city, state, industry, commodities, assigned_user_id")
    .eq("lifecycle_status", "customer")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);

  const accounts = (data ?? []) as AccountRow[];
  const ids = accounts.map((a) => a.id);

  const assigneeIds = [
    ...new Set(accounts.map((a) => a.assigned_user_id).filter(Boolean) as string[]),
  ];

  const [contactsRes, profilesRes] = await Promise.all([
    ids.length
      ? supabase
          .from("crm_contacts")
          .select("id, account_id, name, title, phone, mobile")
          .in("account_id", ids)
          .is("deleted_at", null)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as ContactRow[] }),
    assigneeIds.length
      ? supabase.from("crm_profiles").select("id, full_name, email").in("id", assigneeIds)
      : Promise.resolve({
          data: [] as { id: string; full_name: string | null; email: string | null }[],
        }),
  ]);

  const contactsByAccount = new Map<string, ContactRow[]>();
  for (const c of (contactsRes.data ?? []) as ContactRow[]) {
    const list = contactsByAccount.get(c.account_id) ?? [];
    list.push(c);
    contactsByAccount.set(c.account_id, list);
  }

  const repName = new Map(
    (
      (profilesRes.data ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
      }[]
    ).map((p) => [p.id, firstName(p.full_name, p.email) || "Unnamed rep"]),
  );

  return (
    <PageShell>
      <Card>
        <CardHead
          title="Active Customers"
          hint={accounts.length ? `${accounts.length} ${accounts.length === 1 ? "customer" : "customers"}` : undefined}
        />
        {accounts.length === 0 ? (
          <EmptyState
            icon={<IconCustomers />}
            title="No active customers yet"
            body={`Mark a company "${stageLabel("customer")}" on its profile to see it here.`}
          />
        ) : (
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {accounts.map((a) => (
              <CustomerRow
                key={a.id}
                account={a}
                contacts={contactsByAccount.get(a.id) ?? []}
                repName={a.assigned_user_id ? (repName.get(a.assigned_user_id) ?? null) : null}
              />
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

function CustomerRow({
  account,
  contacts,
  repName,
}: {
  account: AccountRow;
  contacts: ContactRow[];
  repName: string | null;
}) {
  const location = [account.city, account.state].filter(Boolean).join(", ");
  const industryLine = [account.industry, account.commodities].filter(Boolean).join(" · ");

  return (
    <li className="px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/crm/accounts/${account.id}`}
            prefetch={false}
            className="text-[15px] font-semibold text-fg hover:text-accent"
          >
            {account.name}
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${stageTone("customer")}`}
          >
            {stageLabel("customer")}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          {[location, industryLine].filter(Boolean).join(" · ") || "No details on file"}
        </p>
        <p className="mt-0.5 text-[12px] text-fg-subtle">
          Rep: <span className="text-fg-muted">{repName || "Unassigned"}</span>
        </p>
      </div>

      {contacts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className="font-medium text-fg">{c.name}</span>
              {c.title && <span className="text-fg-subtle">{c.title}</span>}
              {(c.phone || c.mobile) && (
                <a
                  href={`tel:${digitsForTel((c.phone || c.mobile) as string)}`}
                  className="font-mono text-accent hover:underline"
                >
                  {c.phone || c.mobile}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-fg-subtle">
          No contacts on file yet.
        </p>
      )}
    </li>
  );
}
