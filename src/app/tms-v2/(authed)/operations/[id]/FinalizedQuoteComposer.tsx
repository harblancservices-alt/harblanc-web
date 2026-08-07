"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import {
  generateFinalizedQuoteDraft,
  saveFinalizedQuoteDraft,
  buildFinalizedQuotePreview,
  sendFinalizedQuote,
} from "@/actions/tms-v2/pipeline";
import { PreviewPane, type Preview } from "./PreviewPane";
import { FieldGrid, type FieldSpec } from "./FieldGrid";
import type { FinalizedQuoteDraft } from "@/lib/data/pipeline-drafts";

const ADVANCED_FIELDS: FieldSpec[] = [
  { name: "pickup_company", label: "Pickup company", type: "text" },
  { name: "pickup_contact_name", label: "Pickup contact", type: "text" },
  { name: "pickup_contact_phone", label: "Pickup phone", type: "tel" },
  { name: "pickup_contact_email", label: "Pickup email", type: "email" },
  { name: "pickup_address_line1", label: "Pickup address", type: "text" },
  { name: "pickup_city", label: "Pickup city", type: "text" },
  { name: "pickup_state", label: "Pickup state", type: "text" },
  { name: "pickup_zip", label: "Pickup ZIP", type: "text" },
  { name: "pickup_window", label: "Pickup window", type: "text" },
  { name: "pickup_loading_hours", label: "Pickup loading hours", type: "text" },
  { name: "delivery_company", label: "Delivery company", type: "text" },
  { name: "delivery_contact_name", label: "Delivery contact", type: "text" },
  { name: "delivery_contact_phone", label: "Delivery phone", type: "tel" },
  { name: "delivery_contact_email", label: "Delivery email", type: "email" },
  { name: "delivery_address_line1", label: "Delivery address", type: "text" },
  { name: "delivery_city", label: "Delivery city", type: "text" },
  { name: "delivery_state", label: "Delivery state", type: "text" },
  { name: "delivery_zip", label: "Delivery ZIP", type: "text" },
  { name: "delivery_window", label: "Delivery window", type: "text" },
  { name: "delivery_receiving_hours", label: "Delivery receiving hours", type: "text" },
  { name: "commodity", label: "Commodity", type: "text" },
  { name: "length_in", label: "Length (in)", type: "number" },
  { name: "width_in", label: "Width (in)", type: "number" },
  { name: "height_in", label: "Height (in)", type: "number" },
  { name: "exact_weight_lbs", label: "Weight (lbs)", type: "number" },
  { name: "quantity", label: "Quantity", type: "number" },
  { name: "handling_type", label: "Handling type", type: "text" },
  { name: "running_condition", label: "Running condition", type: "text" },
  { name: "securement_requirements", label: "Securement requirements", type: "text" },
  { name: "forklift_available", label: "Forklift available", type: "tribool" },
  { name: "driver_assist_required", label: "Driver assist required", type: "tribool" },
  { name: "crane_required", label: "Crane required", type: "tribool" },
  { name: "permits_required", label: "Permits required", type: "tribool" },
  { name: "escort_required", label: "Escort required", type: "tribool" },
  { name: "tarp_required", label: "Tarp required", type: "tribool" },
  { name: "special_instructions", label: "Special instructions", type: "textarea" },
];

/** Finalized quote (rate confirmation) composer — generate a draft
 * (prefilled from the customer's submitted shipment intake against the
 * most recently sent estimate), edit commercial + shipment fields, build a
 * preview (persists the draft + the exact rendered bytes), then send —
 * which auto-advances the lead booked → awaiting_payment. Closes the
 * audit's #2 Tier-1 revenue gap. */
export function FinalizedQuoteComposer({
  quoteRequestId,
  draftId,
  draft,
}: {
  quoteRequestId: string;
  draftId: string | null;
  draft: FinalizedQuoteDraft | null;
}) {
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
    const res = await generateFinalizedQuoteDraft(quoteRequestId);
    setGenerating(false);
    if (res.ok) router.refresh();
    else setGenerateError(res.reason);
  }

  if (!draftId || !draft) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-fg-muted">
          Generates a draft from the most recently sent estimate, prefilled from the customer&apos;s submitted shipment
          intake.
        </p>
        {generateError ? <p className="text-[13px] font-medium text-bad">{generateError}</p> : null}
        <Button type="button" size="sm" onClick={onGenerate} disabled={generating} aria-busy={generating} className="w-fit">
          {generating ? "Generating…" : "Generate finalized quote"}
        </Button>
      </div>
    );
  }

  async function onSave(formData: FormData) {
    setSaving(true);
    setError(null);
    formData.set("finalized_quote_id", draftId as string);
    const result = await saveFinalizedQuoteDraft(formData);
    setSaving(false);
    if (result.ok) router.refresh();
    else setError(result.reason);
  }

  async function onBuild(formData: FormData) {
    setBuilding(true);
    setError(null);
    formData.set("finalized_quote_id", draftId as string);
    const res = await buildFinalizedQuotePreview(formData);
    setBuilding(false);
    if (res.ok) setPreview(res.preview);
    else setError(res.reason);
  }

  async function onSend() {
    setSending(true);
    setError(null);
    const result = await sendFinalizedQuote(draftId as string, quoteRequestId);
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
        <p className="text-[13px] text-fg-muted">Draft #{draft.finalizedQuoteNumber}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Linehaul ($)
            <input name="linehaul" type="number" step="any" min="0" required defaultValue={draft.linehaul ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Fuel surcharge ($)
            <input name="fuel_surcharge" type="number" step="any" min="0" defaultValue={draft.fuelSurcharge ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Permits fee ($)
            <input name="permits_fee" type="number" step="any" min="0" defaultValue={draft.permitsFee ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-fg-muted">
            Payment due
            <input name="payment_due_at" type="date" defaultValue={draft.paymentDueAt ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
          </label>
        </div>
        <label className="flex w-fit flex-col gap-1 text-[12px] font-medium text-fg-muted">
          Expires
          <input name="expiration_at" type="date" defaultValue={draft.expirationAt ?? ""} className="h-9 rounded-md border border-line-strong bg-card px-2.5 text-[13px] text-fg focus:border-fg focus:outline-none" />
        </label>

        <details className="rounded-md border border-line">
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-fg-muted">
            Shipment &amp; handling details (prefilled from intake)
          </summary>
          <div className="p-3">
            <FieldGrid
              fields={ADVANCED_FIELDS}
              defaults={{
                pickup_company: draft.pickupCompany,
                pickup_contact_name: draft.pickupContactName,
                pickup_contact_phone: draft.pickupContactPhone,
                pickup_contact_email: draft.pickupContactEmail,
                pickup_address_line1: draft.pickupAddressLine1,
                pickup_city: draft.pickupCity,
                pickup_state: draft.pickupState,
                pickup_zip: draft.pickupZip,
                pickup_window: draft.pickupWindow,
                pickup_loading_hours: draft.pickupLoadingHours,
                delivery_company: draft.deliveryCompany,
                delivery_contact_name: draft.deliveryContactName,
                delivery_contact_phone: draft.deliveryContactPhone,
                delivery_contact_email: draft.deliveryContactEmail,
                delivery_address_line1: draft.deliveryAddressLine1,
                delivery_city: draft.deliveryCity,
                delivery_state: draft.deliveryState,
                delivery_zip: draft.deliveryZip,
                delivery_window: draft.deliveryWindow,
                delivery_receiving_hours: draft.deliveryReceivingHours,
                commodity: draft.commodity,
                length_in: draft.lengthIn,
                width_in: draft.widthIn,
                height_in: draft.heightIn,
                exact_weight_lbs: draft.exactWeightLbs,
                quantity: draft.quantity,
                handling_type: draft.handlingType,
                running_condition: draft.runningCondition,
                securement_requirements: draft.securementRequirements,
                forklift_available: draft.forkliftAvailable,
                driver_assist_required: draft.driverAssistRequired,
                crane_required: draft.craneRequired,
                permits_required: draft.permitsRequired,
                escort_required: draft.escortRequired,
                tarp_required: draft.tarpRequired,
                special_instructions: draft.specialInstructions,
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
              {sending ? "Sending…" : "Send finalized quote"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
