import { Card, CardHead } from "../../_shell/ui";
import { RepControl } from "./RepControl";
import type { RepOption } from "../CompanyDialog";

const ROLE_LABEL: Record<string, string> = { owner: "Admin", member: "Sales rep" };

/**
 * LEFT column — "Company owner": the assigned rep (crm_profiles.full_name +
 * their CRM role), editable inline via the same RepControl used everywhere
 * else a company's rep assignment is set.
 */
export function CompanyOwnerCard({
  accountId,
  currentRepId,
  currentRepRole,
  reps,
}: {
  accountId: string;
  currentRepId: string | null;
  currentRepRole: string | null;
  reps: RepOption[];
}) {
  const currentLabel = reps.find((r) => r.id === currentRepId)?.label ?? null;

  return (
    <Card>
      <CardHead title="Company owner" />
      <div className="flex flex-col gap-3 p-5">
        {currentLabel && (
          <div>
            <p className="text-[14.5px] font-semibold text-fg">{currentLabel}</p>
            {currentRepRole && <p className="text-[12.5px] text-fg-muted">{ROLE_LABEL[currentRepRole] ?? currentRepRole}</p>}
          </div>
        )}
        <RepControl accountId={accountId} current={currentRepId} reps={reps} />
      </div>
    </Card>
  );
}
