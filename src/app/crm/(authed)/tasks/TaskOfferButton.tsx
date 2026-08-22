"use client";

import { useEffect, useState } from "react";
import { TaskDialog, type TaskDefaults } from "./TaskDialog";
import { getTaskOfferOptions, type TaskOfferOptions } from "./offerActions";

/**
 * The "offer" half of CRM_TASK_INTEGRATION_AUDIT.md Phase 3/4/5: a small,
 * optional "+ Create task" affordance shown after a lead-conversion or
 * document-send moment (claim an AI lead, add to Prospects, release an OTR
 * entry, move to Active Customer, send an RC/BOL) — never automatic, the rep
 * still decides whether to create it and can edit anything before saving.
 * Reuses TaskDialog itself (same dialog Tasks/company-profile/dashboard all
 * share) rather than a second task UI — this component only supplies the
 * options TaskDialog needs (reps/contacts/assignment gating), which the
 * calling page doesn't already have on hand since these moments don't live
 * on a page that was already fetching them.
 */
const DEFAULT_BUTTON_CLASS =
  "inline-flex h-7 items-center rounded-md border border-line-strong bg-elevated px-2.5 text-[12px] font-semibold text-fg-muted transition-colors hover:bg-card hover:text-fg";

export function TaskOfferButton({
  label,
  defaults,
  className,
}: {
  label: string;
  defaults: TaskDefaults;
  /** Overrides the default chip styling — e.g. to match the Dashboard's
   * Next Best Action pill tones instead of the generic "offer" look. */
  className?: string;
}) {
  const [options, setOptions] = useState<TaskOfferOptions | null>(null);

  useEffect(() => {
    let alive = true;
    getTaskOfferOptions(defaults.account_id ?? null).then((o) => {
      if (alive) setOptions(o);
    });
    return () => {
      alive = false;
    };
  }, [defaults.account_id]);

  if (!options) return null;

  // Every Phase-3/4 offer moment defaults to "assigned to whoever's taking
  // this action" (matching TaskDialog's own manual-create default) unless
  // the caller explicitly set something else.
  const resolvedDefaults: TaskDefaults = {
    ...defaults,
    assigned_user_id: defaults.assigned_user_id ?? options.currentUser.id,
  };

  return (
    <TaskDialog
      mode="create"
      accountId={defaults.account_id ?? undefined}
      contacts={options.contacts}
      reps={options.reps}
      canAssignOthers={options.canAssignOthers}
      currentUser={options.currentUser}
      defaults={resolvedDefaults}
      trigger={(open) => (
        <button type="button" onClick={open} className={className ?? DEFAULT_BUTTON_CLASS}>
          {label}
        </button>
      )}
    />
  );
}
