import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { Card, CardHead } from "../../_shell/ui";
import { formatDate, formatMoney, formatNumber } from "../../_shell/format";
import { stageLabel, stageTone } from "../lifecycle";
import type { RepOption } from "../CompanyDialog";
import { EditCompany } from "./EditCompany";
import { LifecycleControl } from "./LifecycleControl";
import { RepControl } from "./RepControl";
import { TagEditor, type CrmTag } from "./TagEditor";
import { ContactsSection, type CrmContact } from "./ContactsSection";
import { NotesSection, type CrmNote } from "./NotesSection";
import { ActivityTimeline, type CrmActivity } from "./ActivityTimeline";
import { TasksSection } from "./TasksSection";
import { LogCallButton } from "./LogCallButton";
import { type CrmTaskItem } from "../../tasks/TaskRow";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return p.full_name || p.email || null;
}

function normalizeHref(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Company profile — the premium, full-record view of a single crm_account.
 * Everything is RLS-scoped to the caller's org: the account, its contacts,
 * notes, tags, activity feed, and the org's rep/tag rosters are all read
 * through the authenticated CRM session. All writes route through the shared
 * server actions, which stamp org_id/user_id from the session.
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
    .select(
      "id, name, industry, website, phone, address, city, state, zip, dot_number, mc_number, company_size, fleet_size, annual_freight_spend, revenue_potential, current_carrier, source, lifecycle_status, assigned_user_id, primary_contact_id, created_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!account) notFound();

  // Fan out the related reads (each RLS-scoped to the caller's org).
  const [
    profilesRes,
    tagsRes,
    accountTagsRes,
    contactsRes,
    notesRes,
    activitiesRes,
    tasksRes,
  ] = await Promise.all([
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    supabase.from("crm_tags").select("id, label, color").order("label"),
    supabase.from("crm_account_tags").select("tag_id").eq("account_id", id),
    supabase
      .from("crm_contacts")
      .select(
        "id, name, title, email, phone, mobile, extension, best_time_to_call, is_decision_maker, linkedin_url, notes, next_followup_at",
      )
      .eq("account_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_notes")
      .select("id, body, is_pinned, created_at, user_id")
      .eq("account_id", id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_activities")
      .select("id, kind, summary, body, occurred_at, user_id")
      .eq("account_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, due_at, priority, status, completed_at, reminder_at, account_id, assigned_user_id",
      )
      .eq("account_id", id)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const allTags = (tagsRes.data ?? []) as CrmTag[];
  const attachedIds = new Set(
    ((accountTagsRes.data ?? []) as { tag_id: string }[]).map((r) => r.tag_id),
  );
  const attachedTags = allTags.filter((t) => attachedIds.has(t.id));

  const contacts = (contactsRes.data ?? []) as CrmContact[];

  const notes: CrmNote[] = ((notesRes.data ?? []) as {
    id: string;
    body: string;
    is_pinned: boolean;
    created_at: string;
    user_id: string | null;
  }[]).map((n) => ({
    id: n.id,
    body: n.body,
    is_pinned: n.is_pinned,
    created_at: n.created_at,
    author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
  }));

  const activities: CrmActivity[] = ((activitiesRes.data ?? []) as {
    id: string;
    kind: string;
    summary: string | null;
    body: string | null;
    occurred_at: string;
    user_id: string | null;
  }[]).map((a) => ({
    id: a.id,
    kind: a.kind,
    summary: a.summary,
    body: a.body,
    occurred_at: a.occurred_at,
    author: a.user_id ? profileName(profileById.get(a.user_id)) : null,
  }));

  const tasks: CrmTaskItem[] = ((tasksRes.data ?? []) as {
    id: string;
    title: string;
    notes: string | null;
    due_at: string | null;
    priority: string | null;
    status: string;
    completed_at: string | null;
    reminder_at: string | null;
    account_id: string | null;
    assigned_user_id: string | null;
  }[]).map((t) => ({ ...t, companyName: account.name as string }));

  const stage = account.lifecycle_status as string;
  const location = [account.city, account.state].filter(Boolean).join(", ");
  const repName = account.assigned_user_id
    ? profileName(profileById.get(account.assigned_user_id as string))
    : null;
  const website = normalizeHref(account.website as string | null);

  const editDefaults = {
    id: account.id as string,
    name: account.name as string,
    industry: account.industry as string | null,
    website: account.website as string | null,
    phone: account.phone as string | null,
    address: account.address as string | null,
    city: account.city as string | null,
    state: account.state as string | null,
    zip: account.zip as string | null,
    dot_number: account.dot_number as string | null,
    mc_number: account.mc_number as string | null,
    company_size: account.company_size as string | null,
    fleet_size: account.fleet_size as number | null,
    annual_freight_spend: account.annual_freight_spend as number | null,
    revenue_potential: account.revenue_potential as number | null,
    current_carrier: account.current_carrier as string | null,
    source: account.source as string | null,
    lifecycle_status: stage,
    assigned_user_id: account.assigned_user_id as string | null,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Header masthead */}
      <div className="mb-4 rounded-2xl bg-graphite px-5 py-5 shadow-e2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <Link
                href="/crm/accounts"
                prefetch={false}
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-dark-dim transition-colors hover:text-white"
              >
                ← Companies
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[24px] font-bold leading-tight tracking-tight text-white sm:text-[28px]">
                {account.name as string}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stageTone(stage)}`}
              >
                {stageLabel(stage)}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-on-dark-dim">
              {[account.industry, location].filter(Boolean).join(" · ") ||
                "No industry or location set"}
            </p>
            <p className="mt-1 text-[12px] text-on-dark-dim">
              Rep: <span className="text-white">{repName || "Unassigned"}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LogCallButton
              accountId={account.id as string}
              contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
            />
            <EditCompany defaults={editDefaults} reps={reps} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Overview: lifecycle control, rep, tags, key facts */}
        <Card>
          <CardHead title="Overview" />
          <div className="flex flex-col gap-5 p-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                  Lifecycle stage
                </p>
                <LifecycleControl accountId={account.id as string} current={stage} />
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                  Assigned rep
                </p>
                <RepControl
                  accountId={account.id as string}
                  current={account.assigned_user_id as string | null}
                  reps={reps}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                Tags
              </p>
              <TagEditor
                accountId={account.id as string}
                attached={attachedTags}
                allTags={allTags}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 md:grid-cols-3">
              <Fact label="Industry" value={account.industry as string | null} />
              <Fact
                label="Website"
                value={
                  website ? (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {account.website as string}
                    </a>
                  ) : null
                }
              />
              <Fact label="Phone" value={account.phone as string | null} mono />
              <Fact
                label="Address"
                value={
                  [account.address, location, account.zip]
                    .filter(Boolean)
                    .join(", ") || null
                }
              />
              <Fact label="DOT #" value={account.dot_number as string | null} mono />
              <Fact label="MC #" value={account.mc_number as string | null} mono />
              <Fact label="Company size" value={account.company_size as string | null} />
              <Fact
                label="Fleet size"
                value={formatNumber(account.fleet_size as number | null)}
                mono
              />
              <Fact label="Current carrier" value={account.current_carrier as string | null} />
              <Fact
                label="Annual freight spend"
                value={formatMoney(account.annual_freight_spend as number | null)}
                mono
              />
              <Fact
                label="Revenue potential"
                value={formatMoney(account.revenue_potential as number | null)}
                mono
              />
              <Fact label="Source" value={account.source as string | null} />
              <Fact
                label="Created"
                value={formatDate(account.created_at as string)}
              />
            </div>
          </div>
        </Card>

        {/* Contacts + notes on the left, activity on the right */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <ContactsSection
              accountId={account.id as string}
              contacts={contacts}
              primaryContactId={account.primary_contact_id as string | null}
            />
            <TasksSection
              accountId={account.id as string}
              tasks={tasks}
              reps={reps}
            />
            <NotesSection accountId={account.id as string} notes={notes} />
          </div>
          <div className="lg:col-span-1">
            <ActivityTimeline activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === "—" || value === "";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-[14px] ${empty ? "text-fg-subtle" : "text-fg"} ${mono && !empty ? "font-mono" : ""}`}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}
