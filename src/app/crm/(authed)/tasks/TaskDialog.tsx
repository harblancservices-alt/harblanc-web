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
import { toDatetimeLocal } from "../_shell/format";
import type { RepOption } from "../accounts/CompanyDialog";
import { TASK_PRIORITIES, PRIORITY_LABEL, DEFAULT_PRIORITY } from "./priority";
import { TaskTypeField } from "./TaskTypeField";
import { createTask, updateTask } from "./actions";

export type TaskDefaults = {
  id?: string;
  title?: string | null;
  notes?: string | null;
  task_type?: string | null;
  due_at?: string | null;
  priority?: string | null;
  reminder_at?: string | null;
  assigned_user_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
};

export type TaskAccountOption = { id: string; name: string };
export type TaskContactOption = { id: string; name: string; accountId?: string | null };

/**
 * Add / edit a task. Two contexts share this one dialog:
 *
 * - PROFILE (company Tasks section): `accountId` is fixed by the caller, so
 *   there's no Company field — `contacts` is just that company's own roster.
 * - STANDALONE (global Tasks page "Add task"): `accountId` is omitted;
 *   `accounts` drives a Company picker, and `contacts` (the org's full
 *   roster, each carrying its own `accountId`) is filtered client-side to
 *   whichever company is currently selected — a task can't sensibly offer a
 *   contact before a company is picked.
 *
 * Assignment is admin-gated: `canAssignOthers` (role=owner) shows a real
 * picker; everyone else sees NO "Assigned rep" field at all — on create a
 * hidden field still submits their own id (so a new task always lands in
 * their own queue), on edit NO assigned_user_id field is submitted at all,
 * so a non-admin saving other changes can never accidentally reassign a task
 * that belongs to someone else. The server action re-enforces both cases
 * regardless of what the UI sends.
 */
export function TaskDialog({
  mode,
  accountId,
  accounts,
  contacts,
  reps,
  canAssignOthers,
  currentUser,
  defaults,
  trigger,
  initialFocus,
}: {
  mode: "create" | "edit";
  /** Fixed company context (profile usage). Omit for the standalone dialog. */
  accountId?: string;
  /** Company options — standalone usage only. */
  accounts?: TaskAccountOption[];
  contacts: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  defaults?: TaskDefaults;
  trigger: (open: () => void) => ReactNode;
  /** Which field grabs focus when the dialog opens — "due_at" for the task
   * row's Reschedule button, so the picker is right there instead of the
   * title. Defaults to the title, same as before this existed. */
  initialFocus?: "title" | "due_at";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const d = defaults ?? {};
  const fixedAccount = accountId !== undefined;
  const [selectedAccountId, setSelectedAccountId] = useState(
    accountId ?? d.account_id ?? "",
  );

  // In profile mode every passed contact already belongs to the fixed
  // company (the caller pre-scoped them) — no filter needed. In standalone
  // mode, only offer contacts that belong to whichever company is selected.
  const contactOptions = useMemo(() => {
    if (fixedAccount) return contacts;
    if (!selectedAccountId) return [];
    return contacts.filter((c) => c.accountId === selectedAccountId);
  }, [contacts, fixedAccount, selectedAccountId]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createTask(formData)
          : await updateTask(d.id as string, formData);
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
        setSelectedAccountId(accountId ?? d.account_id ?? "");
        setOpen(true);
      })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={pending}
        title={mode === "create" ? "New task" : "Edit task"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          {fixedAccount && <input type="hidden" name="account_id" value={accountId} />}

          <Field
            label="Title"
            name="title"
            required
            autoFocus={initialFocus !== "due_at"}
            defaultValue={d.title}
            placeholder="e.g. Send rate sheet"
          />
          <TextareaField label="Notes" name="notes" defaultValue={d.notes} />

          {!fixedAccount && (
            <SelectField
              label="Company"
              name="account_id"
              defaultValue={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">No company</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          )}

          <SelectField
            label="Contact"
            name="contact_id"
            defaultValue={d.contact_id ?? ""}
          >
            <option value="">No specific contact</option>
            {contactOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TaskTypeField defaultValue={d.task_type} />
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field
              label="Due (CST)"
              name="due_at"
              type="datetime-local"
              autoFocus={initialFocus === "due_at"}
              defaultValue={toDatetimeLocal(d.due_at)}
            />
            <Field
              label="Reminder (CST)"
              name="reminder_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(d.reminder_at)}
            />
          </div>

          {canAssignOthers && (
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
          )}
          {!canAssignOthers && mode === "create" && (
            <input type="hidden" name="assigned_user_id" value={currentUser.id} />
          )}

          <SubmitButton pending={pending}>
            {mode === "create" ? "Save task" : "Save changes"}
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
