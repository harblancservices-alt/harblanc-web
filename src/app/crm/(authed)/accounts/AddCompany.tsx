"use client";

import { CompanyDialog, type RepOption } from "./CompanyDialog";
import { IconPlus } from "../_shell/icons";
import { BTN_EDIT, BTN_PRIMARY } from "../_shell/ui";

/**
 * "Add company" — the primary create action on the Companies list. A thin
 * wrapper over the shared CompanyDialog (full-field create), so the list and
 * the profile's Edit action stay in lock-step on every field.
 *
 * ── WHY THERE IS A VARIANT ────────────────────────────────────────────
 *
 * This button appears on two pages, and on only one of them is it the point.
 * On /crm/accounts it creates the thing the page is about, so it is the
 * primary. On /crm/contacts it is a cross-link — useful, but subordinate to
 * "Add contact".
 *
 * Order alone could not express that. BTN_PRIMARY (var(--accent)) and
 * BTN_ACTION (#2563eb) have converged to six points apart since the two were
 * split back in August, so a filled "Add company" next to a filled "Add
 * contact" reads as two equal primaries whichever one comes first. The
 * secondary variant uses BTN_EDIT — the existing blue-outline token for
 * exactly this role — rather than inventing a third weight.
 */
export function AddCompany({
  reps,
  variant = "primary",
}: {
  reps: RepOption[];
  /** "secondary" draws the outline treatment, for pages where creating a
   * company is the cross-link rather than the point. */
  variant?: "primary" | "secondary";
}) {
  return (
    <CompanyDialog
      mode="create"
      reps={reps}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-bold shadow-e2 transition-all hover:-translate-y-0.5 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            variant === "secondary" ? BTN_EDIT : BTN_PRIMARY
          }`}
        >
          <IconPlus width={16} height={16} />
          Add company
        </button>
      )}
    />
  );
}
