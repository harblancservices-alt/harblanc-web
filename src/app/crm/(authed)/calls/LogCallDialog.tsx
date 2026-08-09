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
import { FollowupFields } from "./FollowupFields";

export type CallContactOption = { id: string; name: string };

/**
 * Log a call for a company. First-class capture: outcome (required), the
 * contact spoken to, duration, a one-line summary, notes, and a follow-up
 * toggle that reveals an OPTIONAL reminder date + time — a rep can flag
 * follow-up required without pinning an exact moment, set just a date, or
 * just a time; whatever's left blank stays blank (no forced default — see
 * actions.ts::logCall, which only forms a real reminder_at timestamp when
 * BOTH date and time are present). The time picker is a friendly 12-hour
 * AM/PM dropdown plus four quick-tap presets, not the native time spinner.
 * Saving writes crm_calls AND a timeline activity via the server action. The
 * trigger is a render prop so the profile header and each contact card can
 * style their own opener while sharing the form (a contact card preselects
 * itself via defaultContactId).
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
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setError(null);
    setFollowup(false);
    setReminderDate("");
    setReminderTime("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await logCall(accountId, formData);
      if (res.ok) {
        setOpen(false);
        reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      {trigger(() => {
        reset();
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

          <label className="flex items-start gap-2.5 border border-fg-subtle bg-card px-3 py-2.5">
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
                Sets a reminder that surfaces on your dashboard. Date and time
                are both optional.
              </span>
            </span>
          </label>

          {followup && (
            <FollowupFields
              date={reminderDate}
              time={reminderTime}
              onDateChange={setReminderDate}
              onTimeChange={setReminderTime}
            />
          )}

          <SubmitButton pending={pending} pendingLabel="Logging…">
            Log call
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
