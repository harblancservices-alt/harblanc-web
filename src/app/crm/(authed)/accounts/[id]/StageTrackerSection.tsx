"use client";

import { useState } from "react";
import { StageTracker } from "./StageTracker";
import { normalizeStage } from "../lifecycle";
import { TaskOfferButton } from "../../tasks/TaskOfferButton";

/**
 * Wraps StageTracker so the Onboarding task offer (CRM_TASK_INTEGRATION_
 * AUDIT.md Phase 3) survives the exact moment it needs to appear after: the
 * page stops rendering StageTracker at all once a company IS an Active
 * Customer (see the comment at its call site), so an offer stored as local
 * state INSIDE StageTracker would unmount along with it the instant
 * router.refresh() picks up the new stage. This wrapper stays mounted across
 * that transition — it renders the tracker while there's still a funnel to
 * show, and the offer once there isn't.
 */
export function StageTrackerSection({
  accountId,
  accountName,
  stage,
  variant = "chevron",
}: {
  accountId: string;
  accountName: string;
  stage: string;
  /** Passed straight through to StageTracker. "chevron" (the default, and
   * the only thing the mobile layout uses) keeps the original card-wrapped
   * chevron chain; "strip" is the desktop redesign's flush pipeline bar,
   * which supplies its own chrome from the page shell, so this wrapper
   * renders it bare. See StageTracker.tsx. */
  variant?: "chevron" | "strip";
}) {
  const [justGraduated, setJustGraduated] = useState(false);
  const isActiveCustomer = normalizeStage(stage) === "active_customer";
  const shell = variant === "strip" ? "w-full" : "w-full rounded-lg border border-line-strong bg-card p-4 shadow-e2";

  if (isActiveCustomer) {
    if (!justGraduated) return null;
    return (
      <div className={variant === "strip" ? "w-full" : "w-full rounded-lg border border-line-strong bg-card p-3 shadow-e2"}>
        <TaskOfferButton
          label="+ Add onboarding task"
          defaults={{
            title: `Onboarding: ${accountName}`,
            task_type: "Onboarding",
            account_id: accountId,
          }}
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <StageTracker
        accountId={accountId}
        current={stage}
        variant={variant}
        onStageChange={(next) => {
          if (next === "active_customer") setJustGraduated(true);
        }}
      />
    </div>
  );
}
