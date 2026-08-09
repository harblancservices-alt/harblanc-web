"use client";

import { CompanyDialog, type CompanyDefaults, type RepOption } from "../CompanyDialog";

/**
 * The profile's "Edit" action — the shared CompanyDialog in edit mode.
 * `variant="button"` (default) is the profile header's filled blue button;
 * `variant="link"` is a plain underlined text link — used inline at the top
 * of the Company Details card (2026-08-10 "A" design) next to the company
 * name, where a full button would be too heavy. Same dialog, same data,
 * just a lighter-weight trigger.
 */
export function EditCompany({
  defaults,
  reps,
  canDelete = false,
  variant = "button",
}: {
  defaults: CompanyDefaults;
  reps: RepOption[];
  canDelete?: boolean;
  variant?: "button" | "link";
}) {
  return (
    <CompanyDialog
      mode="edit"
      reps={reps}
      defaults={defaults}
      canDelete={canDelete}
      trigger={(open) =>
        variant === "link" ? (
          <button
            type="button"
            onClick={open}
            className="shrink-0 text-[13px] font-semibold text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover"
          >
            Edit
          </button>
        ) : (
          <button
            type="button"
            onClick={open}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Edit
          </button>
        )
      }
    />
  );
}
