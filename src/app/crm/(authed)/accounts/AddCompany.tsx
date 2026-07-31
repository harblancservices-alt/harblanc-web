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
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[15px] font-bold text-white shadow-e2 transition-all hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <IconPlus width={16} height={16} />
          Add company
        </button>
      )}
    />
  );
}
