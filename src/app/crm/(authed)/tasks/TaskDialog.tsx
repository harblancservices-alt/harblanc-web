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
import { toDatetimeLocal } from "../_shell/format";
import type { RepOption } from "../accounts/CompanyDialog";
import { TASK_PRIORITIES, PRIORITY_LABEL, DEFAULT_PRIORITY } from "./priority";
import { createTask, updateTask } from "./actions";

export type TaskDefaults = {
  id?: string;
  title?: string | null;
  notes?: string | null;
  due_at?: string | null;
  priority?: string | null;
  reminder_at?: string | null;
  assigned_user_id?: string | null;
};

/**
 * Add / edit a task for a company. One full-field form reused for both modes
 * (title, notes, due date, priority, reminder, assigned rep). Create and edit
 * share the form; both route through the task server actions. The trigger is a
 * render prop so callers style their own opener.
 */
export function TaskDialog({
  accountId,
  mode,
  reps,
  defaults,
  trigger,
}: {
  accountId: string;
  mode: "create" | "edit";
  reps: RepOption[];
  defaults?: TaskDefaults;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const d = defaults ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createTask(accountId, formData)
          : await updateTask(d.id as string, accountId, formData);
      if (res.ok) {
        setOpen(false);
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
        setOpen(true);
      })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title={mode === "create" ? "New task" : "Edit task"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field
            label="Title"
            name="title"
            required
            autoFocus
            defaultValue={d.title}
            placeholder="e.g. Send rate sheet"
          />
          <TextareaField label="Notes" name="notes" defaultValue={d.notes} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Due"
              name="due_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(d.due_at)}
            />
            <SelectField
              label="Priority"
              name="priority"
              defaultValue={d.priority ?? DEFAULT_PRIORITY}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Reminder"
              name="reminder_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(d.reminder_at)}
            />
            <SelectField
              label="Assigned rep"
              name="assigned_user_id"
              defaultValue={d.assigned_user_id ?? ""}
            >
              <option value="">Unassigned</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </SelectField>
          </div>

          <SubmitButton pending={pending}>
            {mode === "create" ? "Save task" : "Save changes"}
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
