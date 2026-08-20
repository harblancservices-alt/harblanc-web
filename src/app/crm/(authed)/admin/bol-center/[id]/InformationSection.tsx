"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, BTN_EDIT } from "../../../_shell/ui";
import { Modal } from "../../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../../_shell/form";
import { updateExtractedFields } from "../actions";

export type ExtractedFields = {
  bolNumber: string | null;
  carrier: string | null;
  shipperName: string | null;
  shipperAddress: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  billTo: string | null;
  commodity: string | null;
  weight: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  reference: string | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{label}</p>
      <p className="text-[13.5px] text-fg">{value || "—"}</p>
    </div>
  );
}

/**
 * "From BOL" — fields the upstream extraction captured, editable here only
 * to fix a typo/misread, never to fabricate a value that wasn't extracted.
 * Explicitly labeled "From BOL" everywhere it's shown so it's never confused
 * with ResearchSection's separately-labeled "Research" notes.
 */
export function InformationSection({ bolId, fields }: { bolId: string; fields: ExtractedFields }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateExtractedFields(bolId, formData);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <Card>
      <CardHead
        title="Information — From BOL"
        right={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
          >
            Edit
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
        <Row label="BOL #" value={fields.bolNumber} />
        <Row label="Carrier" value={fields.carrier} />
        <Row label="Shipper" value={fields.shipperName} />
        <Row label="Shipper address" value={fields.shipperAddress} />
        <Row label="Consignee" value={fields.consigneeName} />
        <Row label="Consignee address" value={fields.consigneeAddress} />
        <Row label="Bill to" value={fields.billTo} />
        <Row label="Commodity" value={fields.commodity} />
        <Row label="Weight" value={fields.weight} />
        <Row label="Pickup date" value={fields.pickupDate} />
        <Row label="Delivery date" value={fields.deliveryDate} />
        <Row label="Reference" value={fields.reference} />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Edit information from BOL" wide>
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="BOL number" name="bol_number" defaultValue={fields.bolNumber} autoFocus />
            <Field label="Carrier" name="carrier" defaultValue={fields.carrier} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Shipper name" name="shipper_name" defaultValue={fields.shipperName} />
            <Field label="Consignee name" name="consignee_name" defaultValue={fields.consigneeName} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Shipper address" name="shipper_address" defaultValue={fields.shipperAddress} />
            <Field label="Consignee address" name="consignee_address" defaultValue={fields.consigneeAddress} />
          </div>
          <Field label="Bill to" name="bill_to" defaultValue={fields.billTo} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Commodity" name="commodity" defaultValue={fields.commodity} />
            <Field label="Weight" name="weight" defaultValue={fields.weight} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Pickup date" name="pickup_date" defaultValue={fields.pickupDate} />
            <Field label="Delivery date" name="delivery_date" defaultValue={fields.deliveryDate} />
          </div>
          <Field label="Reference" name="reference" defaultValue={fields.reference} />
          <SubmitButton pending={pending}>Save</SubmitButton>
        </form>
      </Modal>
    </Card>
  );
}
