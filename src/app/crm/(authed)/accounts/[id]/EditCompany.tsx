"use client";

import { CompanyDialog, type CompanyDefaults, type RepOption } from "../CompanyDialog";
import { IconPencil, IconPlus } from "../../_shell/icons";
import { PILL, PILL_SIZE, PILL_DASHED } from "../../_shell/compactForm";

/**
 * The profile's "Edit" action — the shared CompanyDialog in edit mode.
 * `variant="button"` (default) is the profile header's filled blue button;
 * `variant="link"` is a plain underlined text link — used inline at the top
 * of the Company Details card (2026-08-10 "A" design) next to the company
 * name, where a full button would be too heavy; `variant="onDark"` is the
 * same underlined-link treatment in white, for the card's navy header band
 * (2026-08-12 relayout); `variant="pill"` is a dashed "+ Add" pill — used as
 * the Freight Profile section's "+ Add commodity" trigger, since commodities
 * have no dedicated inline picker of their own and this dialog's core form
 * is the only place that field is edited. Same dialog, same data, just a
 * different-weight trigger — `label` overrides the trigger's text for
 * variants other than the default "Edit".
 */
export function EditCompany({
  defaults,
  reps,
  canDelete = false,
  canAssign = false,
  variant = "button",
  label,
}: {
  defaults: CompanyDefaults;
  reps: RepOption[];
  canDelete?: boolean;
  /** Owner-only — surfaces the form's "Assigned rep" select. Defaults to
   * false so any trigger that doesn't know the caller's role can't offer it;
   * updateAccount() enforces the rule regardless. */
  canAssign?: boolean;
  variant?: "button" | "link" | "onDark" | "pill" | "mobileHeader";
  label?: string;
}) {
  return (
    <CompanyDialog
      mode="edit"
      reps={reps}
      defaults={defaults}
      canDelete={canDelete}
      canAssign={canAssign}
      trigger={(open) => {
        if (variant === "link") {
          return (
            <button
              type="button"
              onClick={open}
              className="shrink-0 text-[13px] font-semibold text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover"
            >
              {label ?? "Edit"}
            </button>
          );
        }
        if (variant === "onDark") {
          return (
            <button
              type="button"
              onClick={open}
              className="shrink-0 text-[13px] font-semibold text-white underline decoration-1 underline-offset-2 hover:text-white/80"
            >
              {label ?? "Edit"}
            </button>
          );
        }
        if (variant === "mobileHeader") {
          // Third of the mobile profile's 44px action row (Log call / Add
          // person / Edit) — see mobile/MobileHeader.tsx. Styled here rather
          // than through a className prop so the mobile page's class tokens
          // stay scoped to mobile/ui.ts.
          return (
            <button
              type="button"
              onClick={open}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-[11px] border border-line-strong bg-inset px-2 text-[13px] font-extrabold text-fg transition-colors hover:bg-elevated"
            >
              <IconPencil width={15} height={15} />
              <span className="truncate">{label ?? "Edit"}</span>
            </button>
          );
        }
        if (variant === "pill") {
          return (
            <button
              type="button"
              onClick={open}
              className={`${PILL} ${PILL_SIZE} shrink-0 gap-1 ${PILL_DASHED}`}
            >
              <IconPlus width={12} height={12} />
              {label ?? "Add"}
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={open}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {label ?? "Edit"}
          </button>
        );
      }}
    />
  );
}
