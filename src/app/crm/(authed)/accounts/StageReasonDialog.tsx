"use client";

import { useState } from "react";
import { Modal } from "../_shell/Modal";
import { SubmitButton, FormError } from "../_shell/form";
import { LIFECYCLE_LABEL, type LifecycleStage } from "./lifecycle";

/**
 * "Why?" — the prompt in front of Lost and Disqualified.
 *
 * ONE COPY, TWO CALLERS. The company profile's stage buttons had this inline;
 * the pipeline board needed the same thing when Brent's option-B rebuild gave
 * cards a stage control that can reach every stage. Rather than write the
 * prompt twice — and have the two drift on wording, on what counts as empty,
 * and on whether Disqualified is explained differently from Lost — it lives
 * here and both callers own only their own write.
 *
 * IT GATES, IT DOES NOT WRITE. `onConfirm` hands the reason back and the
 * caller decides what to do with it. Closing without confirming must leave
 * the company exactly where it was, which is why neither caller writes
 * anything before this resolves.
 *
 * The server re-checks regardless (updateLifecycleStatus refuses a terminal
 * stage with no reason), because a dialog is not enforcement.
 */
export function StageReasonDialog({
  stage,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  /** The stage being moved INTO, or null when the dialog is closed. */
  stage: LifecycleStage | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  function close() {
    setReason("");
    onCancel();
  }

  return (
    <Modal
      open={stage !== null}
      onClose={close}
      busy={pending}
      title={stage ? `Why ${LIFECYCLE_LABEL[stage]}?` : ""}
    >
      <FormError message={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (stage && reason.trim()) onConfirm(reason.trim());
        }}
        className="flex flex-col gap-2"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Reason
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            required
            placeholder={
              stage === "disqualified"
                ? "What ruled them out? Wrong freight, no authority, out of area…"
                : "What happened? Went with someone else, price, no response…"
            }
            className="w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <p className="text-[11.5px] text-fg-subtle">
          {stage === "disqualified"
            ? "Disqualified means we ruled them out. It never resurfaces for win-back."
            : "Lost means they went elsewhere. It comes back as a win-back candidate later."}
        </p>
        {/* The textarea's `required` plus the submit guard above are what
            enforce a non-empty reason. */}
        <SubmitButton pending={pending}>
          {stage ? `Mark ${LIFECYCLE_LABEL[stage]}` : "Save"}
        </SubmitButton>
      </form>
    </Modal>
  );
}
