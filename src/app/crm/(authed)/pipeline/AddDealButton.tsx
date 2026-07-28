"use client";

import { DealDialog } from "./DealDialog";
import type { RepOption } from "../accounts/CompanyDialog";
import type { AccountOption, StageOption } from "./types";
import { IconPlus } from "../_shell/icons";

/**
 * Client-side trigger wrapper for DealDialog — mirrors AddCompany.tsx's
 * pattern. The pipeline page that renders this is a Server Component, and
 * DealDialog's `trigger` prop is a function; a Server Component can't pass a
 * plain closure across the client boundary (only serializable values/Server
 * Actions survive that hop), so the trigger button has to be built here,
 * entirely on the client side, rather than inline in the page.
 */
export function AddDealButton({
  accounts,
  stages,
  reps,
  pipelineId,
  defaultStageId,
  variant = "primary",
  stageName,
}: {
  accounts: AccountOption[];
  stages: StageOption[];
  reps: RepOption[];
  pipelineId: string | null;
  defaultStageId?: string;
  /** "primary" is the header's full "New deal" button; "compact" is the
   * small per-column "+" quick-add. */
  variant?: "primary" | "compact";
  stageName?: string;
}) {
  return (
    <DealDialog
      accounts={accounts}
      stages={stages}
      reps={reps}
      pipelineId={pipelineId}
      defaultStageId={defaultStageId}
      trigger={(open) =>
        variant === "primary" ? (
          <button
            type="button"
            onClick={open}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <IconPlus width={16} height={16} />
            New deal
          </button>
        ) : (
          <button
            type="button"
            onClick={open}
            aria-label={`Add deal to ${stageName ?? "stage"}`}
            className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-inset hover:text-fg"
          >
            <IconPlus width={14} height={14} />
          </button>
        )
      }
    />
  );
}
