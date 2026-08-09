"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_shell/Modal";
import { Field, SelectField, TextareaField, SubmitButton, FormError } from "../_shell/form";
import { createCarrier, updateCarrier } from "../shipments/carriers-actions";
import type { CarrierFields, CrmCarrier } from "../shipments/types";

export type CarrierDefaults = Partial<CarrierFields> & { id?: string };

/**
 * The carrier create/edit dialog — ONE full-field form reused by the carrier
 * directory (list "Add carrier" / detail "Edit") AND the shipment workspace's
 * inline "Add carrier" (which needs the freshly created carrier back so it
 * can select it onto the shipment immediately, via `onSaved`). Same
 * fields-object write contract as the rest of shipments/carriers-actions.ts
 * (not FormData) — CarrierFields keys read straight off the form here.
 *
 * Create mode calls onSaved(carrier) when provided (the shipment workspace's
 * case); otherwise it navigates to the new carrier's directory page. Edit
 * mode always calls router.refresh() so the server-rendered detail page
 * picks up the change, then onSaved() with no argument.
 */
export function CarrierFormDialog({
  mode,
  defaults,
  trigger,
  onSaved,
}: {
  mode: "create" | "edit";
  defaults?: CarrierDefaults;
  trigger: (open: () => void) => ReactNode;
  onSaved?: (carrier?: CrmCarrier) => void;
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

    const fields: Partial<CarrierFields> = {
      name: String(formData.get("name") ?? "").trim(),
      mcNumber: (formData.get("mcNumber") as string)?.trim() || null,
      dotNumber: (formData.get("dotNumber") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      email: (formData.get("email") as string)?.trim() || null,
      address: (formData.get("address") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      state: (formData.get("state") as string)?.trim() || null,
      zip: (formData.get("zip") as string)?.trim() || null,
      equipment: (formData.get("equipment") as string)?.trim() || null,
      status: String(formData.get("status") ?? "active"),
      notes: (formData.get("notes") as string)?.trim() || null,
    };

    startTransition(async () => {
      if (mode === "create") {
        const result = await createCarrier(fields);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        if (onSaved) onSaved(result.carrier);
        else router.push(`/crm/carriers/${result.id}`);
      } else {
        const result = await updateCarrier(d.id as string, fields);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
        onSaved?.();
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
        title={mode === "create" ? "New carrier" : "Edit carrier"}
      >
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label="Carrier name" name="name" required autoFocus defaultValue={d.name} />

          <div className="grid grid-cols-2 gap-3">
            <Field label="MC #" name="mcNumber" defaultValue={d.mcNumber} />
            <Field label="DOT #" name="dotNumber" defaultValue={d.dotNumber} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" name="phone" type="tel" inputMode="tel" defaultValue={d.phone} />
            <Field label="Email" name="email" type="email" inputMode="email" defaultValue={d.email} />
          </div>

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
            label="Equipment"
            name="equipment"
            placeholder="e.g. Dry van, Reefer, Flatbed"
            defaultValue={d.equipment}
          />

          <SelectField label="Status" name="status" defaultValue={d.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>

          <TextareaField label="Notes" name="notes" defaultValue={d.notes} rows={3} />

          <SubmitButton pending={pending}>
            {mode === "create" ? "Save carrier" : "Save changes"}
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
