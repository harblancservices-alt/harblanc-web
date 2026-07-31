"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import {
  Field,
  SelectField,
  TextareaField,
  SubmitButton,
  FormError,
} from "../_shell/form";
import { CALL_OUTCOMES } from "./outcomes";
import { logCall } from "./actions";

export type CallContactOption = { id: string; name: string };

/**
 * Log a call for a company. First-class capture: outcome (required), the
 * contact spoken to, duration, a one-line summary, notes, and a follow-up
 * toggle that reveals a reminder date. Saving writes crm_calls AND a timeline
 * activity via the server action. The trigger is a render prop so the profile
 * header and each contact card can style their own opener while sharing the
 * form (a contact card preselects itself via defaultContactId).
 */
export function LogCallDialog({
  accountId,
  contacts,
  defaultContactId,
  trigger,
}: {
  accountId: string;
  contacts: CallContactOption[];
  defaultContactId?: string | null;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followup, setFollowup] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await logCall(accountId, formData);
      if (res.ok) {
        setOpen(false);
        setFollowup(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      {trigger(() => {
        setError(null);
        setFollowup(false);
        setOpen(true);
      })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title="Log a call"
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField label="Outcome" name="outcome" required defaultValue="">
              <option value="" disabled>
                Select outcome…
              </option>
              {CALL_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Contact"
              name="contact_id"
              defaultValue={defaultContactId ?? ""}
            >
              <option value="">No specific contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Duration (min)"
              name="duration_minutes"
              inputMode="numeric"
              placeholder="e.g. 5"
            />
            <Field label="Summary" name="summary" placeholder="One-line recap" />
          </div>

          <TextareaField label="Notes" name="notes" placeholder="What was said, next steps…" />

          <label className="flex items-start gap-2.5 rounded-lg border border-fg-subtle bg-card px-3 py-2.5">
            <input
              type="checkbox"
              name="followup_required"
              checked={followup}
              onChange={(e) => setFollowup(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-medium text-fg">
                Follow-up required
              </span>
              <span className="mt-0.5 block text-[12px] text-fg-subtle">
                Sets a reminder that surfaces on your dashboard.
              </span>
            </span>
          </label>

          {followup && (
            <Field label="Reminder (CST)" name="reminder_at" type="datetime-local" />
          )}

          <SubmitButton pending={pending} pendingLabel="Logging…">
            Log call
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
