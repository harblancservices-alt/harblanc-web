import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { formatPhone } from "@/lib/domain/phone";
import { PageShell, Card, CardHead } from "../../_shell/ui";
import { BackButton } from "../../_shell/BackButton";
import { firstName, titleCaseWords, timestampMs, lastContactStatus } from "../../_shell/format";
import { parsePhones, parseLinks } from "../../_shell/contactFields";
import { ROLE_LABEL, ROLE_TONE, type CrmPersonRoleCategory } from "../../accounts/[id]/roles";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import { TaskRow, type CrmTaskItem } from "../../tasks/TaskRow";
import { callOutcomeLabel } from "../../calls/outcomes";
import type { RepOption } from "../../accounts/CompanyDialog";
import { EditContactButton, AddTaskButton, ContactActionsRow } from "./ContactProfileActions";
import { ContactHistorySection, type CrmContactHistoryItem } from "./ContactHistorySection";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * A single contact's own profile — everything tied to this ONE person in one
 * place: identity, the company they belong to, and every note/call/activity
 * event (see ContactHistorySection.tsx) plus every task linked to them. No
 * schema needed — crm_notes/crm_calls/crm_activities/crm_tasks already carry
 * contact_id (built for the company profile's contact↔task linkage), this
 * page just queries them scoped by contact_id instead of account_id.
 */
export default async function ContactProfilePage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const user = await requireCrmUser();
  const supabase = await createCrmServerClient();
  const isOwner = user.role === "owner";

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select(
      "id, name, title, email, phones, links, best_time_to_call, next_followup_at, last_contacted_at, role_category, account_id",
    )
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!contact) notFound();

  const contactName = titleCaseWords(contact.name as string);
  const accountId = contact.account_id as string | null;
  const contactOptions: TaskContactOption[] = [{ id: contact.id as string, name: contactName }];

  const [accountRes, profilesRes, notesRes, callsRes, activitiesRes, tasksRes] = await Promise.all([
    accountId
      ? supabase.from("crm_accounts").select("id, name").eq("id", accountId).maybeSingle()
      : Promise.resolve({ data: null as { id: string; name: string } | null }),
    supabase.from("crm_profiles").select("id, full_name, email, is_active"),
    supabase
      .from("crm_notes")
      .select("id, body, is_ai, created_at, user_id")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("crm_calls")
      .select("id, outcome, duration_seconds, summary, notes, occurred_at, user_id")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(200),
    // Calls and "note added" rows are excluded — both already have a richer
    // record included directly above, so the generic activity-log line
    // would just repeat the same event.
    supabase
      .from("crm_activities")
      .select("id, kind, summary, body, occurred_at, user_id")
      .eq("contact_id", contactId)
      .not("kind", "in", `(${CRM_ACTIVITY.call},${CRM_ACTIVITY.noteAdded})`)
      .order("occurred_at", { ascending: false })
      .limit(150),
    supabase
      .from("crm_tasks")
      .select(
        "id, title, notes, task_type, due_at, priority, status, completed_at, reminder_at, account_id, contact_id, assigned_user_id",
      )
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const accountName = accountRes.data ? titleCaseWords(accountRes.data.name as string) : null;

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const reps: RepOption[] = profiles
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const notesRows = (notesRes.data ?? []) as {
    id: string;
    body: string;
    is_ai: boolean | null;
    created_at: string;
    user_id: string | null;
  }[];
  const historyFromNotes: CrmContactHistoryItem[] = notesRows.map((n) => ({
    id: n.id,
    type: "note" as const,
    occurredAt: n.created_at,
    author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
    title: n.is_ai ? `AI note: ${n.body}` : n.body,
    body: null,
  }));

  const callRows = (callsRes.data ?? []) as {
    id: string;
    outcome: string | null;
    duration_seconds: number | null;
    summary: string | null;
    notes: string | null;
    occurred_at: string;
    user_id: string | null;
  }[];
  const historyFromCalls: CrmContactHistoryItem[] = callRows.map((c) => {
    const durLabel = c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : "";
    return {
      id: c.id,
      type: "call" as const,
      occurredAt: c.occurred_at,
      author: c.user_id ? profileName(profileById.get(c.user_id)) : null,
      title: `Call · ${callOutcomeLabel(c.outcome)}${durLabel}`,
      body: [c.summary, c.notes].filter(Boolean).join("\n") || null,
    };
  });

  const historyFromActivities: CrmContactHistoryItem[] = ((activitiesRes.data ?? []) as {
    id: string;
    kind: string;
    summary: string | null;
    body: string | null;
    occurred_at: string;
    user_id: string | null;
  }[]).map((a) => ({
    id: a.id,
    type: "activity" as const,
    occurredAt: a.occurred_at,
    author: a.user_id ? profileName(profileById.get(a.user_id)) : null,
    title: a.summary || "Activity",
    body: a.body,
  }));

  const historyItems: CrmContactHistoryItem[] = [
    ...historyFromNotes,
    ...historyFromCalls,
    ...historyFromActivities,
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const tasks: CrmTaskItem[] = ((tasksRes.data ?? []) as {
    id: string;
    title: string;
    notes: string | null;
    task_type: string | null;
    due_at: string | null;
    priority: string | null;
    status: string;
    completed_at: string | null;
    reminder_at: string | null;
    account_id: string | null;
    contact_id: string | null;
    assigned_user_id: string | null;
  }[]).map((t) => ({
    ...t,
    companyName: accountName,
    contactName,
    assigneeName: t.assigned_user_id ? profileName(profileById.get(t.assigned_user_id)) : null,
  }));
  const openTasks = tasks.filter((t) => t.status !== "completed");
  const doneTasks = tasks.filter((t) => t.status === "completed");

  const phones = parsePhones(contact.phones);
  const links = parseLinks(contact.links);
  const primaryPhone = phones[0] ?? null;
  const role = (contact.role_category as string | null) as CrmPersonRoleCategory | null;
  const roleLabel = role ? ROLE_LABEL[role] : null;
  const roleTone = role ? ROLE_TONE[role] : "bg-inset text-fg-subtle";
  const lastContacted = lastContactStatus(timestampMs(contact.last_contacted_at as string | null)).text;

  const editDefaults = {
    id: contact.id as string,
    name: contactName,
    title: contact.title as string | null,
    email: contact.email as string | null,
    phones,
    links,
    best_time_to_call: contact.best_time_to_call as string | null,
    next_followup_at: contact.next_followup_at as string | null,
    role_category: contact.role_category as string | null,
  };

  const currentUser = { id: user.id, label: firstName(user.fullName, user.email) || "You" };

  return (
    <PageShell
      back={
        <BackButton
          fallbackHref={accountId ? `/crm/accounts/${accountId}` : "/crm/contacts"}
          label={accountId ? accountName || "Back to company" : "Back to Contacts"}
        />
      }
    >
      <Card>
        <CardHead
          title={contactName}
          hint={
            accountId ? (
              <Link href={`/crm/accounts/${accountId}`} prefetch={false} className="hover:underline">
                {accountName}
              </Link>
            ) : undefined
          }
          right={<EditContactButton accountId={accountId} defaults={editDefaults} />}
        />

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center bg-graphite text-[20px] font-semibold text-white">
              {contactName.charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[17px] font-bold text-fg">{contactName}</span>
                {roleLabel && (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${roleTone}`}
                  >
                    {roleLabel}
                  </span>
                )}
              </div>
              {contact.title ? (
                <p className="mt-0.5 text-[13px] text-fg-muted">{contact.title as string}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
            <div>
              <span className="text-fg-subtle">Phone: </span>
              {primaryPhone ? (
                <span className="font-mono text-fg">
                  {primaryPhone.label ? `${primaryPhone.label}: ` : ""}
                  {formatPhone(primaryPhone.number)}
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              )}
            </div>
            <div>
              <span className="text-fg-subtle">Email: </span>
              {contact.email ? (
                <a href={`mailto:${contact.email as string}`} className="text-accent hover:underline">
                  {contact.email as string}
                </a>
              ) : (
                <span className="text-fg-subtle">—</span>
              )}
            </div>
            <div>
              <span className="text-fg-subtle">Last contacted: </span>
              <span className="text-fg">{lastContacted}</span>
            </div>
            {contact.best_time_to_call ? (
              <div>
                <span className="text-fg-subtle">Best time to call: </span>
                <span className="text-fg">{contact.best_time_to_call as string}</span>
              </div>
            ) : null}
          </div>

          <ContactActionsRow
            accountId={accountId}
            contactId={contact.id as string}
            contactName={contactName}
            contactEmail={contact.email as string | null}
            contactOptions={contactOptions}
            reps={reps}
            canAssignOthers={isOwner}
            currentUser={currentUser}
            canDelete={isOwner}
          />
        </div>
      </Card>

      <Card>
        <CardHead
          title="Tasks"
          hint={openTasks.length ? `${openTasks.length} open` : undefined}
          right={
            <AddTaskButton
              accountId={accountId}
              contactOptions={contactOptions}
              reps={reps}
              canAssignOthers={isOwner}
              currentUser={currentUser}
              defaultContactId={contact.id as string}
            />
          }
        />
        {tasks.length === 0 ? (
          <p className="px-5 py-7 text-center text-[13px] text-fg-muted">
            No tasks tied to {contactName} yet.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2 p-2.5">
              {openTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  accountId={accountId ?? undefined}
                  reps={reps}
                  contacts={contactOptions}
                  canAssignOthers={isOwner}
                  currentUser={currentUser}
                />
              ))}
            </ul>
            {doneTasks.length > 0 && (
              <details className="border-t border-line-strong">
                <summary className="cursor-pointer list-none px-4 py-2.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                  {doneTasks.length} completed
                </summary>
                <ul className="flex flex-col gap-2 border-t border-line-strong p-2.5">
                  {doneTasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      accountId={accountId ?? undefined}
                      reps={reps}
                      contacts={contactOptions}
                      canAssignOthers={isOwner}
                      currentUser={currentUser}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>

      <ContactHistorySection accountId={accountId} items={historyItems} />
    </PageShell>
  );
}
