"use client";

import { CompanyDialog, type CompanyDefaults, type RepOption } from "../CompanyDialog";

/**
 * Shown on a company profile when needs_finalize is true — the company was
 * quick-created from the Contacts page's "type a new name" combobox path
 * (contacts/actions.ts::createContactQuick) with nothing but a name. Its own
 * CompanyDialog instance (independent of the page's own Edit button) opens
 * the same full edit form; saving through it clears needs_finalize
 * (accounts/actions.ts::updateAccount), so this banner disappears on its own
 * the next time the profile loads.
 */
export function FinalizeBanner({
  defaults,
  reps,
}: {
  defaults: CompanyDefaults;
  reps: RepOption[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/30 bg-warn-bg px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-warn">Quick-added company</p>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          Created from a quick contact add with just a name — finish its details.
        </p>
      </div>
      <CompanyDialog
        mode="edit"
        reps={reps}
        defaults={defaults}
        trigger={(open) => (
          <button
            type="button"
            onClick={open}
            className="inline-flex shrink-0 items-center rounded-lg bg-warn px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90"
          >
            Finalize now
          </button>
        )}
      />
    </div>
  );
}
