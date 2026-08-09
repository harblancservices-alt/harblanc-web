import { IconCompanies } from "../../_shell/icons";
import { BackButton } from "../../_shell/BackButton";
import { EditCompany } from "./EditCompany";
import { CompanyMoreMenu } from "./CompanyMoreMenu";
import type { CompanyDefaults, RepOption } from "../CompanyDialog";
import type { TaskContactOption } from "../../tasks/TaskDialog";

/** Compact "Rep: Tyler Brooks" chip — a small initial avatar + name, purely
 * a display (changing the rep is still done through the Edit button's
 * "Assigned rep" field, same as every other company field it edits). Plain
 * server-rendered markup, no interaction, so no client-boundary concerns. */
function RepBadge({ label }: { label: string | null }) {
  if (!label) {
    return <span className="inline-flex items-center text-[12px] font-medium text-fg-subtle">Unassigned</span>;
  }
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-inset py-1 pl-1 pr-3 text-[12.5px] font-semibold text-fg">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
        {initial}
      </span>
      Rep: {label}
    </span>
  );
}

/**
 * The company profile's top bar — breadcrumb back to Companies, a building
 * icon + name, a compact Sales Rep chip (moved here from the Company Details
 * card, 2026-08-09 follow-up), and the top-right More/Edit pair (Brent's
 * reference design). Stage/tags/one-tap contact actions all moved out of
 * this bar into the columns below — this row is identity + navigation +
 * rep-at-a-glance only. The rep chip lives in the SAME flex-wrap group as
 * More/Edit so the whole trailing cluster wraps together under the name on
 * narrow screens rather than the chip colliding with the buttons.
 */
export function CompanyHeader({
  name,
  accountId,
  contacts,
  editDefaults,
  reps,
  repLabel,
  canDelete,
}: {
  name: string;
  accountId: string;
  contacts: TaskContactOption[];
  editDefaults: CompanyDefaults & { id: string };
  reps: RepOption[];
  repLabel: string | null;
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
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <RepBadge label={repLabel} />
        <CompanyMoreMenu accountId={accountId} accountName={name} contacts={contacts} canDelete={canDelete} />
        <EditCompany defaults={editDefaults} reps={reps} canDelete={canDelete} />
      </div>
    </div>
  );
}
