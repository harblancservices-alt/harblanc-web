"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../../_shell/Modal";
import { Field, SubmitButton, FormError } from "../../../_shell/form";
import { updateExtractedFields, saveResearchNotes } from "../actions";
import { SectionCard } from "./SectionCard";
import { DEPTH_EDIT } from "./buttonDepth";

/** Every From-BOL field, unchanged from the original InformationSection —
 * still one shared edit form so a single submit can't clobber fields it
 * isn't showing (updateExtractedFields overwrites all 12 at once). Shipper/
 * consignee/bill-to name+address now render read-only on their own
 * CompanyRow instead of here, and carrier renders on CarrierRow — this
 * component owns only the load-shipment-level fields + the research note,
 * so no field is duplicated across the page. */
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

function FillChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-md border border-dashed border-fg-subtle px-2 py-1 text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-accent/50 hover:text-accent"
    >
      + Add {label}
    </button>
  );
}

function FieldRow({ label, value, onFill }: { label: string; value: string | null; onFill: () => void }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg">{label}</p>
      {value ? <p className="text-[13px] text-fg">{value}</p> : <div className="mt-0.5"><FillChip label={label} onClick={onFill} /></div>}
    </div>
  );
}

export function LoadDetailSummary({ bolId, fields, notes }: { bolId: string; fields: ExtractedFields; notes: string | null }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  const summary = [
    fields.commodity,
    fields.weight ? `${fields.weight} lb` : null,
    [fields.pickupDate, fields.deliveryDate].filter(Boolean).join(" → ") || null,
  ]
    .filter(Boolean)
    .join(" · ") || "No commodity, weight, or dates extracted";

  function onEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setEditError(null);
    startTransition(async () => {
      const res = await updateExtractedFields(bolId, formData);
      if (res.ok) {
        setEditOpen(false);
        router.refresh();
      } else setEditError(res.error);
    });
  }

  function saveNotes() {
    startTransition(async () => {
      await saveResearchNotes(bolId, notesValue);
      router.refresh();
    });
  }

  return (
    <SectionCard
      title="Load Detail"
      hint={fields.bolNumber ? `BOL ${fields.bolNumber}` : undefined}
      right={
        <button type="button" onClick={() => setEditOpen(true)} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${DEPTH_EDIT}`}>
          Edit
        </button>
      }
    >
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-inset/60">
        <p className="truncate text-[13px] text-fg">{summary}</p>
        <span className="shrink-0 text-[11.5px] font-semibold text-accent">{expanded ? "Hide details" : "Details"}</span>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line p-4 sm:grid-cols-3">
          <FieldRow label="Commodity" value={fields.commodity} onFill={() => setEditOpen(true)} />
          <FieldRow label="Weight" value={fields.weight} onFill={() => setEditOpen(true)} />
          <FieldRow label="Reference" value={fields.reference} onFill={() => setEditOpen(true)} />
          <FieldRow label="Pickup date" value={fields.pickupDate} onFill={() => setEditOpen(true)} />
          <FieldRow label="Delivery date" value={fields.deliveryDate} onFill={() => setEditOpen(true)} />
          <FieldRow label="BOL #" value={fields.bolNumber} onFill={() => setEditOpen(true)} />

          <div className="col-span-2 sm:col-span-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg">Research note</p>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onBlur={saveNotes}
              placeholder="No research notes yet."
              className="mt-1 h-20 w-full resize-none rounded-md border border-line-strong bg-inset p-2.5 text-[13px] text-fg outline-none focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} busy={pending} title="Edit information from BOL" wide>
        <FormError message={editError} />
        <form onSubmit={onEditSubmit} className="flex flex-col gap-2">
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
    </SectionCard>
  );
}
