"use client";

import { CompanyDialog, type RepOption } from "./CompanyDialog";
import { IconPlus } from "../_shell/icons";

/**
 * "Add company" — the primary create action on the Companies list. A thin
 * wrapper over the shared CompanyDialog (full-field create), so the list and
 * the profile's Edit action stay in lock-step on every field.
 */
export function AddCompany({ reps }: { reps: RepOption[] }) {
  return (
    <CompanyDialog
      mode="create"
      reps={reps}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <IconPlus width={16} height={16} />
          Add company
        </button>
      )}
    />
  );
}
