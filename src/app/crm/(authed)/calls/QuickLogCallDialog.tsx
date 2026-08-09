"use client";

import { useMemo, useState, useTransition } from "react";
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
import { CompanyCombobox, type CompanyOption, type CompanySelection } from "../contacts/CompanyCombobox";
import { CALL_OUTCOMES } from "./outcomes";
import { logCall } from "./actions";
import { FollowupFields } from "./FollowupFields";

export type QuickCallContactOption = { id: string; name: string; accountId?: string | null };

/**
 * The dashboard's "Calls" quick action — logs a call without a fixed company
 * context (unlike LogCallDialog, which always opens from inside a company
 * profile with accountId already known). Reuses CompanyCombobox with
 * allowCreate=false (a quick call log shouldn't silently spin up a bare
 * company the way the contact quick-add does — the rep must pick a company
 * that already exists), then the same outcome/contact/summary fields and
 * logCall server action as the profile dialog.
 */
export function QuickLogCallDialog({
  accounts,
  contacts,
  trigger,
}: {
  accounts: CompanyOption[];
  contacts: QuickCallContactOption[];
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followup, setFollowup] = useState(false);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState<CompanySelection>({ text: "", selectedId: null });
  const router = useRouter();

  const contactOptions = useMemo(() => {
    if (!company.selectedId) return [];
    return contacts.filter((c) => c.accountId === company.selectedId);
  }, [contacts, company.selectedId]);

  function reset() {
    setError(null);
    setFollowup(false);
    setReminderDate("");
    setReminderTime("");
    setCompany({ text: "", selectedId: null });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!company.selectedId) {
      setError("Pick an existing company first.");
      return;
    }
    const formData = new FormData(e.currentTarget);
    setError(null);
    const accountId = company.selectedId;
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

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Log a call">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <CompanyCombobox
            companies={accounts}
            selection={company}
            onChange={setCompany}
            allowCreate={false}
          />

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
              defaultValue=""
              disabled={!company.selectedId}
            >
              <option value="">
                {company.selectedId ? "No specific contact" : "Pick a company first"}
              </option>
              {contactOptions.map((c) => (
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
