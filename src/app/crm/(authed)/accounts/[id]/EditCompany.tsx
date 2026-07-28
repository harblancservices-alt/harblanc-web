"use client";

import { CompanyDialog, type CompanyDefaults, type RepOption } from "../CompanyDialog";

/**
 * The profile's "Edit" action — the shared CompanyDialog in edit mode, opened
 * from a secondary button in the profile header.
 */
export function EditCompany({
  defaults,
  reps,
  canDelete = false,
}: {
  defaults: CompanyDefaults;
  reps: RepOption[];
  canDelete?: boolean;
}) {
  return (
    <CompanyDialog
      mode="edit"
      reps={reps}
      defaults={defaults}
      canDelete={canDelete}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Edit
        </button>
      )}
    />
  );
}
