import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, StatTile, EmptyState } from "./_shell/ui";
import { IconCompanies, IconContacts, IconPipeline, IconTasks, IconPlus } from "./_shell/icons";

export const dynamic = "force-dynamic";

/**
 * CRM Dashboard — a "what's next" scaffold. Reads only crm_* tables (scoped to
 * the caller's org by RLS); never touches any dispatch table. In Phase 1 most
 * cards are empty-state prompts that seed the workflow loop.
 */
export default async function CrmDashboardPage() {
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();

  // Lightweight head counts. `head: true` returns only the count (no rows).
  const [companies, contacts, deals, tasks] = await Promise.all([
    supabase
      .from("crm_accounts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .is("deleted_at", null),
    supabase
      .from("crm_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const firstName = (user.fullName || "there").split(" ")[0];

  return (
    <PageShell
      eyebrow="Hello Hotshot CRM"
      title={`Welcome, ${firstName}`}
      subtitle="Your book of business at a glance."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Companies" value={String(companies.count ?? 0)} />
        <StatTile label="Contacts" value={String(contacts.count ?? 0)} />
        <StatTile label="Open deals" value={String(deals.count ?? 0)} />
        <StatTile label="Open tasks" value={String(tasks.count ?? 0)} />
      </div>

      <Card>
        <CardHead
          title="What's next"
          hint="Get the pipeline rolling — these are the first moves."
        />
        <div className="grid gap-px bg-line sm:grid-cols-3">
          <NextStep
            icon={<IconCompanies />}
            title="Add your first company"
            body="Start your book of business with a target carrier or shipper."
            href="/crm/accounts"
            cta="Add company"
          />
          <NextStep
            icon={<IconContacts />}
            title="Log a contact"
            body="Attach the decision-maker and their best time to call."
            href="/crm/contacts"
            cta="Coming soon"
            disabled
          />
          <NextStep
            icon={<IconPipeline />}
            title="Open a deal"
            body="Track freight opportunities through your pipeline stages."
            href="/crm/pipeline"
            cta="Coming soon"
            disabled
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Tasks due today" />
          <EmptyState
            icon={<IconTasks />}
            title="Nothing due"
            body="Tasks and follow-up reminders you schedule will surface here."
          />
        </Card>
        <Card>
          <CardHead title="Recent activity" />
          <EmptyState
            icon={<IconPipeline />}
            title="No activity yet"
            body="Calls, notes, and deal changes across your org will appear here."
          />
        </Card>
      </div>
    </PageShell>
  );
}

function NextStep({
  icon,
  title,
  body,
  href,
  cta,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 bg-card p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-inset text-fg-muted">
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-[14px] font-semibold text-fg">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{body}</p>
      </div>
      {disabled ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-inset px-3 py-1.5 text-[12px] font-semibold text-fg-subtle">
          {cta}
        </span>
      ) : (
        <Link
          href={href}
          prefetch={false}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <IconPlus width={15} height={15} />
          {cta}
        </Link>
      )}
    </div>
  );
}
