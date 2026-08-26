import { listTeamMembers } from "../accounts-data";
import { getOpenTasksForReport } from "../due-data";
import { TasksBoard } from "./TasksBoard";

export const dynamic = "force-dynamic";

/**
 * Admin → Tasks — every open task in the org laid out one column per person,
 * unassigned first, and draggable between them.
 *
 * Owner-only by the same gate as the rest of the section: /crm/admin/layout
 * awaits requireCrmAdmin() before any child renders, and the write behind the
 * drag (../../tasks/actions.ts::reassignTask) re-checks role === 'owner'
 * itself, so a tampered request can't move work either.
 *
 * BOTH READS ARE THE EXISTING ONES. The tasks come from due-data.ts, the same
 * query Overview's due readout uses — the board and that readout are two views
 * of one result set and can never disagree about who owes what. The roster is
 * listTeamMembers(), the Accounts tab's own reader, so a person is named
 * identically everywhere in the section.
 *
 * SUSPENDED members are filtered out. Their book was already handed to
 * somebody when they were suspended (admin/actions.ts::suspendAndReassignMember)
 * and reassignTask refuses to move work onto an inactive account, so a column
 * for them would be a drop target that always errors.
 */
export default async function AdminTasksPage() {
  const [{ tasks, now }, members] = await Promise.all([getOpenTasksForReport(), listTeamMembers()]);

  const team = members
    .filter((m) => m.isActive)
    .map((m) => ({ id: m.id, name: m.fullName || m.email || "Unnamed" }));

  return (
    // Fills the remaining viewport so the columns get real height to scroll
    // inside rather than stretching the page — 13rem covers the shell padding
    // and the Admin tab row above.
    <div className="flex h-[calc(100vh-13rem)] flex-col">
      <TasksBoard tasks={tasks} team={team} now={now} />
    </div>
  );
}
