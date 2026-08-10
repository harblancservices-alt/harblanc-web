"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { TextareaField, SubmitButton, FormError } from "../_shell/form";
import { BTN_ACTION } from "../_shell/ui";
import { IconNote, IconTruck, IconTasks } from "../_shell/icons";
import { addNote } from "../accounts/actions";
import { createShipment } from "../shipments/actions";
import { TaskDialog, type TaskContactOption } from "../tasks/TaskDialog";
import type { RepOption } from "../accounts/CompanyDialog";
import type { CompanyCardData } from "../accounts/CompanyListCard";

export type ActiveCustomerActionsData = {
  contactsByAccount: Record<string, TaskContactOption[]>;
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
};

/**
 * Active Customers list row actions — a DIFFERENT set from the regular
 * Companies list (CompanyRowActions: Notes/Add contact/Loads). An active
 * customer's day-to-day work from this list is booking freight and staying
 * on top of follow-ups, not building out the contact roster, so the three
 * actions here are: Add notes (a quick account-level note, not scoped to any
 * one contact — same addNote() the profile's Notes tab writes), Add load
 * (creates a new crm_shipment prefilled to this customer via createShipment,
 * then jumps straight to it), and Add task (the standard TaskDialog, fixed
 * to this company). `variant` mirrors CompanyRowActions' sizing split.
 */
export function ActiveCustomerRowActions({
  company,
  contacts,
  reps,
  canAssignOthers,
  currentUser,
  variant,
}: {
  company: CompanyCardData;
  contacts: TaskContactOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  variant: "table" | "card";
}) {
  const itemClass =
    variant === "table"
      ? `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_ACTION}`
      : `inline-flex h-11 min-w-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors ${BTN_ACTION}`;
  const iconSize = variant === "table" ? 12 : 13;

  return (
    <div className={variant === "table" ? "flex items-center justify-end gap-1.5" : "mt-3 flex items-center gap-1.5"}>
      <AddNoteButton accountId={company.id} accountName={company.name} itemClass={itemClass} iconSize={iconSize} />

      <AddLoadButton accountId={company.id} itemClass={itemClass} iconSize={iconSize} />

      <TaskDialog
        mode="create"
        accountId={company.id}
        contacts={contacts}
        reps={reps}
        canAssignOthers={canAssignOthers}
        currentUser={currentUser}
        trigger={(open) => (
          <button type="button" onClick={open} className={itemClass}>
            <IconTasks width={iconSize} height={iconSize} />
            Add task
          </button>
        )}
      />
    </div>
  );
}

function AddNoteButton({
  accountId,
  accountName,
  itemClass,
  iconSize,
}: {
  accountId: string;
  accountName: string;
  itemClass: string;
  iconSize: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = String(new FormData(e.currentTarget).get("body") ?? "").trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(accountId, trimmed, false);
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
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={itemClass}
      >
        <IconNote width={iconSize} height={iconSize} />
        Add notes
      </button>

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title={`Note on ${accountName}`}>
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <TextareaField label="Note" name="body" autoFocus placeholder={`What's worth knowing about ${accountName}?`} />
          <SubmitButton pending={pending}>Save note</SubmitButton>
        </form>
      </Modal>
    </>
  );
}

function AddLoadButton({ accountId, itemClass, iconSize }: { accountId: string; itemClass: string; iconSize: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await createShipment({ accountId });
      if (result.ok) router.push(`/crm/shipments/${result.id}`);
      else setError(result.error);
    });
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={pending} className={`${itemClass} disabled:opacity-60`}>
        <IconTruck width={iconSize} height={iconSize} />
        {pending ? "…" : "Add load"}
      </button>
      {error && <span className="text-[11px] text-bad">{error}</span>}
    </>
  );
}
