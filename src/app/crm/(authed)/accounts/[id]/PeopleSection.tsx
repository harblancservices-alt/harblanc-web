"use client";

import { Card, CardHead } from "../../_shell/ui";
import { IconContacts } from "../../_shell/icons";
import { PersonCard, type CrmContact } from "./PersonCard";
import type { TaskContactOption } from "../../tasks/TaskDialog";
import type { RepOption } from "../CompanyDialog";

/**
 * "People at this company" — the Overview tab's roster, same PersonCard grid
 * as the Contacts tab (Brent's approved mock: one card design everywhere a
 * contact renders) but without the primary-contact toggle or Delete — those
 * stay Contacts-tab-only capabilities, matching this section's original
 * narrower "display + quick-action" scope. "Add person" lives in the Tasks
 * button bar above (see page.tsx/TasksSection.tsx), not in this header.
 */
export function PeopleSection({
  accountId,
  people,
  reps,
  contactOptions,
  canAssignOthers,
  currentUser,
}: {
  accountId: string;
  people: CrmContact[];
  reps: RepOption[];
  contactOptions: TaskContactOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
}) {
  return (
    <Card>
      <CardHead
        title="People at this company"
        hint={people.length ? `${people.length} on file` : undefined}
      />

      {people.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center bg-inset text-fg-subtle">
            <IconContacts />
          </span>
          <p className="text-[14px] font-semibold text-fg">No people yet</p>
          <p className="max-w-xs text-[13px] text-fg-muted">
            Add whoever you talk to at this company — purchasing, dispatch, receiving.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <PersonCard
              key={p.id}
              accountId={accountId}
              person={p}
              reps={reps}
              contactOptions={contactOptions}
              canAssignOthers={canAssignOthers}
              currentUser={currentUser}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
