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
}: {
  accountId: string;
  accountName: string;
  stage: string;
}) {
  const [justGraduated, setJustGraduated] = useState(false);
  const isActiveCustomer = normalizeStage(stage) === "active_customer";

  if (isActiveCustomer) {
    if (!justGraduated) return null;
    return (
      <div className="w-full rounded-lg border border-line-strong bg-card p-3 shadow-e2">
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
    <div className="w-full rounded-lg border border-line-strong bg-card p-4 shadow-e2">
      <StageTracker
        accountId={accountId}
        current={stage}
        onStageChange={(next) => {
          if (next === "active_customer") setJustGraduated(true);
        }}
      />
    </div>
  );
}
