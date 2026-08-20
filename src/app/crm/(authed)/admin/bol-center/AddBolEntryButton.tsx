"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { BTN_PRIMARY } from "../../_shell/ui";
import { addBolEntry } from "./actions";

/**
 * "Add entry" for BOL Center — a bill of lading Brent has already worked,
 * captured as a researched profile. Mirrors admin/otr/AddOtrEntryButton.tsx's
 * shape; wider (`wide`) than OTR's dialog since a BOL profile carries a full
 * shipper/consignee/route field set instead of a handful of company fields.
 */
export function AddBolEntryButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addBolEntry(formData);
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
        className={`inline-flex h-9.5 shrink-0 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-bold transition-colors ${BTN_PRIMARY}`}
      >
        Add BOL entry
      </button>

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Add BOL entry" wide>
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="BOL number" name="bol_number" autoFocus />
            <Field label="Carrier" name="carrier" />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Shipper name" name="shipper_name" />
            <Field label="Consignee name" name="consignee_name" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Shipper address" name="shipper_address" />
            <Field label="Consignee address" name="consignee_address" />
          </div>

          <Field label="Bill to" name="bill_to" />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Commodity" name="commodity" />
            <Field label="Weight" name="weight" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Pickup date" name="pickup_date" placeholder="YYYY-MM-DD" />
            <Field label="Delivery date" name="delivery_date" placeholder="YYYY-MM-DD" />
          </div>

          <Field label="Reference" name="reference" />
          <TextareaField label="Notes" name="notes" rows={3} placeholder="What did the research turn up?" />

          <SubmitButton pending={pending}>Add entry</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
