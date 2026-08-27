import type { CrmUser } from "@/lib/crm/auth";
import { firstName } from "../_shell/format";
import {
  QuickAddCompanyButton,
  QuickAddContactButton,
  QuickAddTaskButton,
} from "../QuickActions";
import { getAgentDashboardData } from "./agent-data";
import { listQuickTasks } from "../admin/quick-task-actions";
import { createCrmServerClient } from "@/lib/crm/auth";
import type { ComposerContactOption } from "../tasks/TaskComposer";
import { SalesDashboard } from "./dashboard/SalesDashboard";

/**
 * The Dashboard's server half: read this person's work and this person's
 * companies, hand them to the client component.
 *
 * ONE PATH FOR EVERYONE (Brent, 2026-08-25). There is no role argument and
 * no "view as somebody else" — the page shows the signed-in user their own
 * tasks and their own companies, whoever they are. An owner-only toggle and
 * a `?as=<id>` preview lived here briefly while the agent dashboard was
 * pinned to a role branch; both went when Dashboard became this screen for
 * all users.
 *
 * `reps` is deliberately empty: HeaderAddCompanyButton renders the
 * Add-company dialog without `canAssign`, so its rep <select> never renders
 * and the roster would be queried for nothing. A new company lands on its
 * creator anyway — createAccount defaults assigned_user_id to `user.id`.
 */
export async function AgentHome({ user }: { user: CrmUser }) {
  const { tasks, companies, completeness, callsToday, reachedToday, now } =
    await getAgentDashboardData(user);

  /** The org's quick-task buttons — the same rows Admin → Overview shows.
   * Shared vocabulary, not a per-user list; the agent uses them and cannot
   * edit them (see TaskComposer's header). */
  const quickTasks = await listQuickTasks();

  /** Contacts at the agent's OWN companies, for the composer's picker —
   * scoped the same way every other agent surface is, rather than the
   * org-wide list the admin composer gets. */
  const supabase = await createCrmServerClient();
  const ownedIds = companies.map((c) => c.id);
  const { data: contactRows } = ownedIds.length
    ? await supabase
        .from("crm_contacts")
        .select("id, name, account_id, title")
        .in("account_id", ownedIds)
        .is("deleted_at", null)
        .order("name", { ascending: true })
    : { data: [] };
  const composerContacts: ComposerContactOption[] = (
    (contactRows ?? []) as { id: string; name: string | null; account_id: string; title: string | null }[]
  ).map((c) => ({
    id: c.id,
    name: c.name || "Unnamed contact",
    accountId: c.account_id,
    title: c.title ?? null,
  }));

  /** The agent's own companies, as the shape both quick-add dialogs want.
   * Reusing the rows already loaded rather than querying a company list
   * again for a dropdown. */
  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <SalesDashboard
      name={firstName(user.fullName, user.email) || "You"}
      tasks={tasks}
      companies={companies}
      completeness={completeness}
      callsToday={callsToday}
      reachedToday={reachedToday}
      now={now}
      createBar={
        <>
          {/* THE EXISTING DIALOGS, not new ones. Each of these is the same
              component the rest of the CRM opens — a second creation path
              for a company or a contact is exactly the duplication the
              brief rules out.

              The reference's fourth button, "+ Note", is NOT here and has
              no honest equivalent: a note belongs to a company, the
              standalone QuickNoteDialog was deleted on 2026-08-26, and the
              place notes are written is the composer on the company page.
              A button that opened a company picker in order to then open a
              note box would be a worse version of clicking the company.
              Flagged rather than faked. */}
          <QuickAddCompanyButton reps={[]} />
          <QuickAddContactButton companies={companyOptions} />
          <QuickAddTaskButton
            companies={companyOptions}
            contacts={composerContacts}
            quickTasks={quickTasks}
            currentUser={{ id: user.id, label: firstName(user.fullName, user.email) || "You" }}
          />
        </>
      }
    />
  );
}
