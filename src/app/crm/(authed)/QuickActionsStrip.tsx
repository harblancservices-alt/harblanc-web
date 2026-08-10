import {
  QuickAddContactButton,
  QuickAddCompanyButton,
  QuickLogCallButton,
  QuickAddTaskButton,
  QuickResearchQueueButton,
} from "./QuickActions";
import type { CompanyOption } from "./contacts/CompanyCombobox";
import type { TaskAccountOption, TaskContactOption } from "./tasks/TaskDialog";
import type { RepOption } from "./accounts/CompanyDialog";

/**
 * QUICK-ACTIONS STRIP — the Command Center mockup's row of 5 solid pill
 * buttons (+ Add Company, + Add Contact, Log Call, + Task, Research Queue),
 * sitting between the counter tiles and the 3-column body. A plain
 * `overflow-x-auto` flex row: on desktop it's wide enough that every pill
 * fits with room to spare, on mobile it becomes the horizontally-scrollable
 * row the mockup calls for — same markup, no viewport-specific branching
 * needed. A pure server wrapper (no hooks of its own) around the small
 * Client Components in QuickActions.tsx, which each own their own dialog
 * trigger.
 */
export function QuickActionsStrip({
  companies,
  reps,
  taskAccounts,
  taskContacts,
  canAssignOthers,
  currentUser,
}: {
  companies: CompanyOption[];
  reps: RepOption[];
  taskAccounts: TaskAccountOption[];
  taskContacts: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  return (
    <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
      <QuickAddCompanyButton reps={reps} />
      <QuickAddContactButton companies={companies} />
      <QuickLogCallButton />
      <QuickAddTaskButton
        accounts={taskAccounts}
        contacts={taskContacts}
        reps={reps}
        canAssignOthers={canAssignOthers}
        currentUser={currentUser}
      />
      <QuickResearchQueueButton />
    </div>
  );
}
