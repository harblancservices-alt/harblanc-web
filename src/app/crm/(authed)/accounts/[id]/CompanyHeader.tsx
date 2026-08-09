import { IconCompanies } from "../../_shell/icons";
import { BackButton } from "../../_shell/BackButton";
import { EditCompany } from "./EditCompany";
import { CompanyMoreMenu } from "./CompanyMoreMenu";
import type { CompanyDefaults, RepOption } from "../CompanyDialog";
import type { TaskContactOption } from "../../tasks/TaskDialog";

/**
 * The company profile's top bar — breadcrumb back to Companies, a building
 * icon + name, and the top-right More/Edit pair (Brent's reference design).
 * Stage/tags/one-tap contact actions all moved out of this bar into the
 * columns below (About card, Company Details card) — this row is identity +
 * navigation only.
 */
export function CompanyHeader({
  name,
  accountId,
  contacts,
  editDefaults,
  reps,
  canDelete,
}: {
  name: string;
  accountId: string;
  contacts: TaskContactOption[];
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  canDelete: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-line-strong bg-card px-4 py-3.5 shadow-e2">
      <div className="flex min-w-0 items-center gap-3">
        <BackButton fallbackHref="/crm/accounts" label="Companies" />
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-inset text-fg-subtle">
          <IconCompanies width={18} height={18} />
        </span>
        <h1 className="truncate text-[18px] font-bold tracking-tight text-fg">{name}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CompanyMoreMenu accountId={accountId} accountName={name} contacts={contacts} canDelete={canDelete} />
        <EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} />
      </div>
    </div>
  );
}
