"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { generateBolDraft, saveBolDraft, buildBolPreview, sendBol } from "@/actions/tms-v2/pipeline";
import { PreviewPane, type Preview } from "./PreviewPane";
import { FieldGrid, type FieldSpec } from "./FieldGrid";
import type { BolDraft } from "@/lib/data/pipeline-drafts";

const ADVANCED_FIELDS: FieldSpec[] = [
  { name: "dispatch_reference", label: "Dispatch reference", type: "text" },
  { name: "shipper_company", label: "Shipper company", type: "text" },
  { name: "shipper_contact_name", label: "Shipper contact", type: "text" },
  { name: "shipper_contact_phone", label: "Shipper phone", type: "tel" },
  { name: "shipper_contact_email", label: "Shipper email", type: "email" },
  { name: "shipper_address_line1", label: "Shipper address", type: "text" },
  { name: "shipper_city", label: "Shipper city", type: "text" },
  { name: "shipper_state", label: "Shipper state", type: "text" },
  { name: "shipper_zip", label: "Shipper ZIP", type: "text" },
  { name: "pickup_window", label: "Pickup window", type: "text" },
  { name: "pickup_instructions", label: "Pickup instructions", type: "textarea" },
  { name: "consignee_company", label: "Consignee company", type: "text" },
  { name: "consignee_contact_name", label: "Consignee contact", type: "text" },
  { name: "consignee_contact_phone", label: "Consignee phone", type: "tel" },
  { name: "consignee_contact_email", label: "Consignee email", type: "email" },
  { name: "consignee_address_line1", label: "Consignee address", type: "text" },
  { name: "consignee_city", label: "Consignee city", type: "text" },
  { name: "consignee_state", label: "Consignee state", type: "text" },
  { name: "consignee_zip", label: "Consignee ZIP", type: "text" },
  { name: "delivery_window", label: "Delivery window", type: "text" },
  { name: "delivery_instructions", label: "Delivery instructions", type: "textarea" },
  { name: "commodity", label: "Commodity", type: "text" },
  { name: "quantity", label: "Quantity", type: "number" },
  { name: "handling_units_type", label: "Handling units type", type: "text" },
  { name: "length_in", label: "Length (in)", type: "number" },
  { name: "width_in", label: "Width (in)", type: "number" },
  { name: "height_in", label: "Height (in)", type: "number" },
  { name: "weight_lbs", label: "Weight (lbs)", type: "number" },
  { name: "nmfc_code", label: "NMFC code", type: "text" },
  { name: "freight_class", label: "Freight class", type: "text" },
  { name: "hazmat", label: "Hazmat", type: "checkbox" },
  { name: "special_handling", label: "Special handling", type: "text" },
  { name: "driver_assist_required", label: "Driver assist required", type: "checkbox" },
  { name: "tarp_required", label: "Tarp required", type: "checkbox" },
  { name: "permits_required", label: "Permits required", type: "checkbox" },
  { name: "escort_required", label: "Escort required", type: "checkbox" },
  { name: "rigging_required", label: "Rigging required", type: "checkbox" },
  { name: "appointment_required", label: "Appointment required", type: "checkbox" },
  { name: "special_instructions", label: "Special instructions", type: "textarea" },
  { name: "dispatch_notes", label: "Dispatch notes", type: "textarea" },
];

/** Bill of lading composer — generate a draft from the most recently sent
 * finalized quote, edit shipper/consignee/freight fields, build a preview,
 * then send. Distinct from the BOL receiver/carrier e-signature shipped in
 * Phase 5A (that signs an uploaded scan; this GENERATES the document). */
export function BolComposer({ quoteRequestId, draftId, draft }: { quoteRequestId: string; draftId: string | null; draft: BolDraft | null }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setGenerating(true);
    setGenerateError(null);
    const res = await generateBolDraft(quoteRequestId);
    setGenerating(false);
    if (res.ok) router.refresh();
    else setGenerateError(res.reason);
  }

  if (!draftId || !draft) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-fg-muted">Generates a draft prefilled from the most recently sent finalized quote.</p>
        {generateError ? <p className="text-[13px] font-medium text-bad">{generateError}</p> : null}
        <Button type="button" size="sm" onClick={onGenerate} disabled={generating} aria-busy={generating} className="w-fit">
          {generating ? "Generating…" : "Generate BOL"}
        </Button>
      </div>
    );
  }

  async function onSave(formData: FormData) {
    setSaving(true);
    setError(null);
    formData.set("bol_id", draftId as string);
    const result = await saveBolDraft(formData);
    setSaving(false);
    if (result.ok) router.refresh();
    else setError(result.reason);
  }

  async function onBuild(formData: FormData) {
    setBuilding(true);
    setError(null);
    formData.set("bol_id", draftId as string);
    const res = await buildBolPreview(formData);
    setBuilding(false);
    if (res.ok) setPreview(res.preview);
    else setError(res.reason);
  }

  async function onSend() {
    setSending(true);
    setError(null);
    const result = await sendBol(draftId as string, quoteRequestId);
    setSending(false);
    if (result.ok) {
      setPreview(null);
      router.refresh();
    } else {
      setError(result.reason);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-col gap-3">
        <p className="text-[13px] text-fg-muted">Draft #{draft.bolNumber}</p>
        <label className="flex w-fit flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Issue date
          <input name="issue_date" type="date" defaultValue={draft.issueDate ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
        </label>

        <details className="rounded-md border border-line" open>
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-fg-muted">Shipper, consignee &amp; freight details</summary>
          <div className="p-3">
            <FieldGrid
              fields={ADVANCED_FIELDS}
              defaults={{
                dispatch_reference: draft.dispatchReference,
                shipper_company: draft.shipperCompany,
                shipper_contact_name: draft.shipperContactName,
                shipper_contact_phone: draft.shipperContactPhone,
                shipper_contact_email: draft.shipperContactEmail,
                shipper_address_line1: draft.shipperAddressLine1,
                shipper_city: draft.shipperCity,
                shipper_state: draft.shipperState,
                shipper_zip: draft.shipperZip,
                pickup_window: draft.pickupWindow,
                pickup_instructions: draft.pickupInstructions,
                consignee_company: draft.consigneeCompany,
                consignee_contact_name: draft.consigneeContactName,
                consignee_contact_phone: draft.consigneeContactPhone,
                consignee_contact_email: draft.consigneeContactEmail,
                consignee_address_line1: draft.consigneeAddressLine1,
                consignee_city: draft.consigneeCity,
                consignee_state: draft.consigneeState,
                consignee_zip: draft.consigneeZip,
                delivery_window: draft.deliveryWindow,
                delivery_instructions: draft.deliveryInstructions,
                commodity: draft.commodity,
                quantity: draft.quantity,
                handling_units_type: draft.handlingUnitsType,
                length_in: draft.lengthIn,
                width_in: draft.widthIn,
                height_in: draft.heightIn,
                weight_lbs: draft.weightLbs,
                nmfc_code: draft.nmfcCode,
                freight_class: draft.freightClass,
                hazmat: draft.hazmat,
                special_handling: draft.specialHandling,
                driver_assist_required: draft.driverAssistRequired,
                tarp_required: draft.tarpRequired,
                permits_required: draft.permitsRequired,
                escort_required: draft.escortRequired,
                rigging_required: draft.riggingRequired,
                appointment_required: draft.appointmentRequired,
                special_instructions: draft.specialInstructions,
                dispatch_notes: draft.dispatchNotes,
              }}
            />
          </div>
        </details>

        {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="submit" formAction={onSave} variant="secondary" size="sm" disabled={saving || building} aria-busy={saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button type="submit" formAction={onBuild} size="sm" disabled={saving || building} aria-busy={building}>
            {building ? "Building…" : "Build preview"}
          </Button>
        </div>
      </form>

      {preview ? (
        <>
          <PreviewPane preview={preview} />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={onSend} disabled={sending} aria-busy={sending}>
              {sending ? "Sending…" : "Send BOL"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
