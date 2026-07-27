import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { PageShell, Card, CardHead, EmptyState } from "../../_shell/ui";
import { IconContacts, IconPipeline } from "../../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * Company detail — Phase-1 stub. Renders the account header and empty-state
 * scaffolds for the related records (contacts, deals, activity, tasks) that
 * later steps will fill in. RLS-scoped to the caller's org.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCrmUser();
  const supabase = await createCrmServerClient();

  const { data: account } = await supabase
    .from("crm_accounts")
    .select("id, name, industry, city, state, phone, website, lifecycle_status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!account) notFound();

  const location = [account.city, account.state].filter(Boolean).join(", ");

  return (
    <PageShell
      eyebrow="Company"
      title={account.name as string}
      subtitle={[account.industry, location].filter(Boolean).join(" · ") || undefined}
      actions={
        <Link
          href="/crm/accounts"
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-inset"
        >
          ← All companies
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Contacts" />
          <EmptyState
            icon={<IconContacts />}
            title="No contacts"
            body="Decision-makers you add for this company will live here."
          />
        </Card>
        <Card>
          <CardHead title="Deals" />
          <EmptyState
            icon={<IconPipeline />}
            title="No deals"
            body="Freight opportunities for this company will track here."
          />
        </Card>
      </div>
    </PageShell>
  );
}
