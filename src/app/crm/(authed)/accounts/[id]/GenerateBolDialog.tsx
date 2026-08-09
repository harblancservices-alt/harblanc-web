"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_shell/Modal";
import { Field, TextareaField, SubmitButton, FormError } from "../../_shell/form";
import { generateBol } from "./bol-actions";

/**
 * "Generate BOL" — a quick Bill of Lading pre-filled with this company as
 * Shipper (see CrmBolPDF.tsx). The rep only fills in Consignee + shipment
 * details; Date defaults to today. Saves through the same generateBol
 * action/crm_documents row every other BOL uses, so it shows up in the same
 * list immediately.
 */
export function GenerateBolDialog({
  accountId,
  shipperName,
  shipperAddress,
  shipperPhone,
  trigger,
}: {
  accountId: string;
  shipperName: string;
  shipperAddress: string | null;
  shipperPhone: string | null;
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const str = (key: string) => String(fd.get(key) ?? "").trim();
    const opt = (key: string) => str(key) || null;

    setError(null);
    startTransition(async () => {
      const res = await generateBol(accountId, {
        shipperName,
        shipperAddress,
        shipperPhone,
        date: str("date") || today,
        reference: opt("reference"),
        consigneeName: opt("consignee_name"),
        consigneeAddress: opt("consignee_address"),
        commodity: opt("commodity"),
        weight: opt("weight"),
        pieces: opt("pieces"),
        specialInstructions: opt("special_instructions"),
      });
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

      <Modal open={open} onClose={() => setOpen(false)} busy={pending} title="Generate BOL">
        <FormError message={error} />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <p className="text-[12.5px] text-fg-muted">
            Shipper is filled in from this company — {shipperName}. Add the rest below.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date" name="date" type="date" defaultValue={today} />
            <Field label="Reference / PO#" name="reference" />
          </div>

          <Field label="Consignee name" name="consignee_name" placeholder="Who's it going to?" />
          <Field label="Consignee address" name="consignee_address" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Commodity" name="commodity" placeholder="e.g. Machinery parts" />
            <Field label="Weight" name="weight" placeholder="e.g. 4,200 lbs" />
          </div>
          <Field label="Pieces / Pallets" name="pieces" placeholder="e.g. 3 pallets" />
          <TextareaField label="Special instructions" name="special_instructions" />

          <SubmitButton pending={pending} pendingLabel="Generating…">
            Generate BOL
          </SubmitButton>
        </form>
      </Modal>
    </>
  );
}
