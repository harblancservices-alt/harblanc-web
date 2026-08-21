import { notFound } from "next/navigation";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { CRM_ACTIVITY } from "@/lib/crm/activity";
import { PageShell, Card, CardHead } from "../../_shell/ui";
import { firstName, titleCaseWords, formatDate, formatDateTime } from "../../_shell/format";
import { parsePhones, parseLinks } from "../../_shell/contactFields";
import { RoleControl } from "../../accounts/[id]/RoleControl";
import { MoodControl } from "../../accounts/[id]/MoodControl";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import { TaskRow, type CrmTaskItem } from "../../tasks/TaskRow";
import { callOutcomeLabel } from "../../calls/outcomes";
import type { RepOption } from "../../accounts/CompanyDialog";
import { NotesTab, type CrmNoteItem } from "../../accounts/[id]/NotesTab";
import { ContactHeader } from "./ContactHeader";
import { AddTaskButton } from "./ContactProfileActions";
import { ContactHistorySection, type CrmContactHistoryItem } from "./ContactHistorySection";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; full_name: string | null; email: string | null; is_active: boolean };

function profileName(p: ProfileRow | undefined): string | null {
  if (!p) return null;
  return firstName(p.full_name, p.email) || null;
}

/**
 * A single contact's own profile — surface 4 of the Company/Contact rebuild.
 * Header (name/title/company-link/role "status", one-tap Call/Email, Edit +
 * More) then this one person's own Tasks / Activity / Notes, each hiding to
 * a real empty state when there's nothing yet. No schema needed —
 * crm_notes/crm_calls/crm_activities/crm_tasks already carry contact_id,
 * this page just queries them scoped by contact_id instead of account_id.
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
      "id, name, title, email, phones, links, best_time_to_call, next_followup_at, last_contacted_at, role_category, current_mood, account_id",
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
      .select("id, body, is_ai, is_pinned, created_at, user_id")
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
    is_pinned: boolean | null;
    created_at: string;
    user_id: string | null;
  }[];
  const humanNotes: CrmNoteItem[] = notesRows
    .filter((n) => !n.is_ai)
    .map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
      author: n.user_id ? profileName(profileById.get(n.user_id)) : null,
      contactId,
      contactName: null,
      isPinned: n.is_pinned ?? false,
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

  const historyItems: CrmContactHistoryItem[] = [...historyFromCalls, ...historyFromActivities].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

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
    current_mood: contact.current_mood as string | null,
  };

  const currentUser = { id: user.id, label: firstName(user.fullName, user.email) || "You" };
  const hasDetails = Boolean(contact.best_time_to_call || contact.next_followup_at || contact.last_contacted_at);

  return (
    <PageShell>
      {/* 2026-08-20: rebuilt to crm-design's Contact detail composition —
          header full-width above a 2-column [300px_1fr] grid, matching the
          Company profile's own grid exactly (both pages now share the same
          left-column-facts / right-column-activity shape). Was a single
          centered ~800px column of stacked cards (a 2026-08-09 fix for a
          real sparse-content problem at full width) — that problem doesn't
          recur in the 2-column layout since the left column is narrow by
          design and the right column has real content depth (Tasks +
          History + Notes together). */}
      <div className="flex flex-col gap-4">
        <ContactHeader
          contact={editDefaults}
          accountId={accountId}
          accountName={accountName}
          phone={primaryPhone?.number ?? null}
          email={contact.email as string | null}
          contactOptions={contactOptions}
          canDelete={isOwner}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
          {/* Left — contact facts, matching crm-design's "Contact info" card slot. */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardHead title="Role" />
              <div className="p-4">
                <RoleControl contactId={contact.id as string} accountId={accountId} current={contact.role_category as string | null} />
              </div>
            </Card>

            <Card>
              <CardHead title="Current Mood" />
              <div className="p-4">
                <MoodControl contactId={contact.id as string} accountId={accountId} current={contact.current_mood as string | null} />
              </div>
            </Card>

            {hasDetails && (
              <Card>
                <CardHead title="Details" />
                <dl className="divide-y divide-line">
                  {contact.best_time_to_call && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Best time to call</dt>
                      <dd className="truncate text-[12.5px] font-medium text-fg">{contact.best_time_to_call as string}</dd>
                    </div>
                  )}
                  {contact.next_followup_at && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Next follow-up</dt>
                      <dd className="truncate text-[12.5px] font-medium text-fg">{formatDateTime(contact.next_followup_at as string)}</dd>
                    </div>
                  )}
                  {contact.last_contacted_at && (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Last contacted</dt>
                      <dd className="truncate text-[12.5px] font-medium text-fg">{formatDate(contact.last_contacted_at as string)}</dd>
                    </div>
                  )}
                </dl>
              </Card>
            )}
          </div>

          {/* Right — activity, matching crm-design's "Activity history" card slot
              (widened here to also hold Tasks/Notes, real sections the prototype's
              simpler mock doesn't have). */}
          <div className="flex flex-col gap-4">
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
                <p className="px-5 py-6 text-center text-[13px] text-fg-muted">No tasks tied to {contactName} yet.</p>
              ) : (
                <>
                  <ul className="grid grid-cols-1 items-start gap-2 p-2.5 sm:grid-cols-2">
                    {openTasks.map((t) => (
                      <TaskRow key={t.id} task={t} accountId={accountId ?? undefined} reps={reps} contacts={contactOptions} canAssignOthers={isOwner} currentUser={currentUser} />
                    ))}
                  </ul>
                  {doneTasks.length > 0 && (
                    <details className="border-t border-line-strong">
                      <summary className="cursor-pointer list-none px-4 py-2 text-[12px] font-semibold text-fg-subtle transition-colors hover:text-fg">
                        {doneTasks.length} completed
                      </summary>
                      <ul className="grid grid-cols-1 items-start gap-2 border-t border-line-strong p-2.5 sm:grid-cols-2">
                        {doneTasks.map((t) => (
                          <TaskRow key={t.id} task={t} accountId={accountId ?? undefined} reps={reps} contacts={contactOptions} canAssignOthers={isOwner} currentUser={currentUser} />
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </Card>

            <ContactHistorySection accountId={accountId} items={historyItems} />

            <Card>
              <CardHead title="Notes" hint={humanNotes.length ? `${humanNotes.length} on file` : undefined} />
              <NotesTab
                accountId={accountId}
                contactId={contact.id as string}
                contactName={contactName}
                notes={humanNotes}
                currentUser={currentUser}
              />
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
