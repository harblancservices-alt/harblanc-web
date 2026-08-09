"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { createLocation, updateLocation } from "./locations-actions";

export type LocationDefaults = {
  id?: string;
  label?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  receiving_hours?: string | null;
  dock_notes?: string | null;
};

export function LocationDialog({
  accountId,
  mode,
  defaults,
  trigger,
}: {
  accountId: string;
  mode: "create" | "edit";
  defaults?: LocationDefaults;
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
          ? await createLocation(accountId, formData)
          : await updateLocation(d.id as string, accountId, formData);
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
        title={mode === "create" ? "Add location" : "Edit location"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field
            label="Label"
            name="label"
            placeholder="e.g. Main warehouse, Yard 2"
            defaultValue={d.label}
            autoFocus
          />
          <Field label="Address" name="address" defaultValue={d.address} />
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <Field label="City" name="city" defaultValue={d.city} />
            </div>
            <div className="col-span-1">
              <Field label="State" name="state" defaultValue={d.state} />
            </div>
            <div className="col-span-2">
              <Field label="ZIP" name="zip" defaultValue={d.zip} />
            </div>
          </div>
          <Field
            label="Receiving hours"
            name="receiving_hours"
            placeholder="e.g. Mon–Fri 7am–3pm"
            defaultValue={d.receiving_hours}
          />
          <TextareaField
            label="Dock / appointment notes"
            name="dock_notes"
            placeholder="e.g. Appointment required 24h ahead, dock 4 only"
            defaultValue={d.dock_notes}
          />
          <SubmitButton pending={pending}>{mode === "create" ? "Save location" : "Save changes"}</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
