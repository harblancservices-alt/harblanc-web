"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveBolDraft,
  buildBolPreview,
  sendBol,
} from "../bol-actions";
import {
  EmailPreviewPanel,
  type EmailPreviewData,
} from "./EmailPreviewPanel";

/**
 * Bill of Lading composer — utilitarian transport-paperwork form.
 *
 * Workflow mirrors the FinalizedQuoteComposer:
 *   1. Composer fields → Build Preview
 *   2. Build Preview persists the rendered BOL HTML/text + form fields
 *   3. Preview stays visible until the next build
 *   4. Editing any field flips the stale flag; Send disables until rebuild
 *   5. Send transmits the persisted preview bytes verbatim
 *
 * Same preview/send byte parity guarantee as the estimate and
 * finalized-quote layers.
 */

export type BolPreviewSnapshot = {
  subject: string;
  preheader: string;
  html: string;
  to: string;
  from: string;
  replyTo: string;
  builtAt: string;
};

export type BolDraft = {
  id: string;
  bolNumber: string;
  finalizedQuoteId: string;
  finalizedQuoteNumberLabel: string | null;
  rangeQuoteNumberLabel: string;

  dispatchReference: string | null;
  issueDate: string | null;

  shipperCompany: string | null;
  shipperContactName: string | null;
  shipperContactPhone: string | null;
  shipperContactEmail: string | null;
  shipperAddressLine1: string | null;
  shipperAddressLine2: string | null;
  shipperCity: string | null;
  shipperState: string | null;
  shipperZip: string | null;
  pickupWindow: string | null;
  pickupInstructions: string | null;

  consigneeCompany: string | null;
  consigneeContactName: string | null;
  consigneeContactPhone: string | null;
  consigneeContactEmail: string | null;
  consigneeAddressLine1: string | null;
  consigneeAddressLine2: string | null;
  consigneeCity: string | null;
  consigneeState: string | null;
  consigneeZip: string | null;
  deliveryWindow: string | null;
  deliveryInstructions: string | null;

  commodity: string | null;
  quantity: number | null;
  handlingUnitsType: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  weightLbs: number | null;
  nmfcCode: string | null;
  freightClass: string | null;
  hazmat: boolean;
  specialHandling: string | null;

  driverAssistRequired: boolean;
  tarpRequired: boolean;
  permitsRequired: boolean;
  escortRequired: boolean;
  riggingRequired: boolean;
  appointmentRequired: boolean;
  specialInstructions: string | null;

  dispatchNotes: string | null;

  sentAt: string | null;
  sentEmailId: string | null;
  preview: BolPreviewSnapshot | null;
};

const labelCls =
  "block font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase";
const inputCls =
  "block w-full bg-white border border-zinc-200 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-red-600 focus:outline-none";

function strOrEmpty(v: string | null | undefined): string {
  return v == null ? "" : v;
}
function numOrEmpty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v);
}

export function BillOfLadingComposer({
  quoteRequestId,
  leadName,
  draft,
}: {
  quoteRequestId: string;
  leadName: string;
  draft: BolDraft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const [dispatchReference, setDispatchReference] = useState(strOrEmpty(draft.dispatchReference));
  const [issueDate, setIssueDate] = useState(strOrEmpty(draft.issueDate));

  // Shipper
  const [shipperCompany, setShipperCompany] = useState(strOrEmpty(draft.shipperCompany));
  const [shipperContactName, setShipperContactName] = useState(strOrEmpty(draft.shipperContactName));
  const [shipperContactPhone, setShipperContactPhone] = useState(strOrEmpty(draft.shipperContactPhone));
  const [shipperContactEmail, setShipperContactEmail] = useState(strOrEmpty(draft.shipperContactEmail));
  const [shipperAddressLine1, setShipperAddressLine1] = useState(strOrEmpty(draft.shipperAddressLine1));
  const [shipperAddressLine2, setShipperAddressLine2] = useState(strOrEmpty(draft.shipperAddressLine2));
  const [shipperCity, setShipperCity] = useState(strOrEmpty(draft.shipperCity));
  const [shipperState, setShipperState] = useState(strOrEmpty(draft.shipperState));
  const [shipperZip, setShipperZip] = useState(strOrEmpty(draft.shipperZip));
  const [pickupWindow, setPickupWindow] = useState(strOrEmpty(draft.pickupWindow));
  const [pickupInstructions, setPickupInstructions] = useState(strOrEmpty(draft.pickupInstructions));

  // Consignee
  const [consigneeCompany, setConsigneeCompany] = useState(strOrEmpty(draft.consigneeCompany));
  const [consigneeContactName, setConsigneeContactName] = useState(strOrEmpty(draft.consigneeContactName));
  const [consigneeContactPhone, setConsigneeContactPhone] = useState(strOrEmpty(draft.consigneeContactPhone));
  const [consigneeContactEmail, setConsigneeContactEmail] = useState(strOrEmpty(draft.consigneeContactEmail));
  const [consigneeAddressLine1, setConsigneeAddressLine1] = useState(strOrEmpty(draft.consigneeAddressLine1));
  const [consigneeAddressLine2, setConsigneeAddressLine2] = useState(strOrEmpty(draft.consigneeAddressLine2));
  const [consigneeCity, setConsigneeCity] = useState(strOrEmpty(draft.consigneeCity));
  const [consigneeState, setConsigneeState] = useState(strOrEmpty(draft.consigneeState));
  const [consigneeZip, setConsigneeZip] = useState(strOrEmpty(draft.consigneeZip));
  const [deliveryWindow, setDeliveryWindow] = useState(strOrEmpty(draft.deliveryWindow));
  const [deliveryInstructions, setDeliveryInstructions] = useState(strOrEmpty(draft.deliveryInstructions));

  // Freight
  const [commodity, setCommodity] = useState(strOrEmpty(draft.commodity));
  const [quantity, setQuantity] = useState(numOrEmpty(draft.quantity));
  const [handlingUnitsType, setHandlingUnitsType] = useState(strOrEmpty(draft.handlingUnitsType));
  const [lengthIn, setLengthIn] = useState(numOrEmpty(draft.lengthIn));
  const [widthIn, setWidthIn] = useState(numOrEmpty(draft.widthIn));
  const [heightIn, setHeightIn] = useState(numOrEmpty(draft.heightIn));
  const [weightLbs, setWeightLbs] = useState(numOrEmpty(draft.weightLbs));
  const [nmfcCode, setNmfcCode] = useState(strOrEmpty(draft.nmfcCode));
  const [freightClass, setFreightClass] = useState(strOrEmpty(draft.freightClass));
  const [hazmat, setHazmat] = useState<boolean>(draft.hazmat);
  const [specialHandling, setSpecialHandling] = useState(strOrEmpty(draft.specialHandling));

  // Ops
  const [driverAssistRequired, setDriverAssistRequired] = useState<boolean>(draft.driverAssistRequired);
  const [tarpRequired, setTarpRequired] = useState<boolean>(draft.tarpRequired);
  const [permitsRequired, setPermitsRequired] = useState<boolean>(draft.permitsRequired);
  const [escortRequired, setEscortRequired] = useState<boolean>(draft.escortRequired);
  const [riggingRequired, setRiggingRequired] = useState<boolean>(draft.riggingRequired);
  const [appointmentRequired, setAppointmentRequired] = useState<boolean>(draft.appointmentRequired);
  const [specialInstructions, setSpecialInstructions] = useState(strOrEmpty(draft.specialInstructions));

  const [dispatchNotes, setDispatchNotes] = useState(strOrEmpty(draft.dispatchNotes));

  const [preview, setPreview] = useState<EmailPreviewData | null>(() =>
    draft.preview
      ? {
          subject: draft.preview.subject,
          preheader: draft.preview.preheader,
          html: draft.preview.html,
          to: draft.preview.to,
          from: draft.preview.from,
          replyTo: draft.preview.replyTo,
        }
      : null,
  );
  const [stale, setStale] = useState<boolean>(false);

  function markStale() {
    if (preview && !stale) setStale(true);
    if (notice) setNotice(null);
  }

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("bol_id", draft.id);
    fd.append("quote_request_id", quoteRequestId);

    fd.append("dispatch_reference", dispatchReference);
    fd.append("issue_date", issueDate);

    fd.append("shipper_company", shipperCompany);
    fd.append("shipper_contact_name", shipperContactName);
    fd.append("shipper_contact_phone", shipperContactPhone);
    fd.append("shipper_contact_email", shipperContactEmail);
    fd.append("shipper_address_line1", shipperAddressLine1);
    fd.append("shipper_address_line2", shipperAddressLine2);
    fd.append("shipper_city", shipperCity);
    fd.append("shipper_state", shipperState);
    fd.append("shipper_zip", shipperZip);
    fd.append("pickup_window", pickupWindow);
    fd.append("pickup_instructions", pickupInstructions);

    fd.append("consignee_company", consigneeCompany);
    fd.append("consignee_contact_name", consigneeContactName);
    fd.append("consignee_contact_phone", consigneeContactPhone);
    fd.append("consignee_contact_email", consigneeContactEmail);
    fd.append("consignee_address_line1", consigneeAddressLine1);
    fd.append("consignee_address_line2", consigneeAddressLine2);
    fd.append("consignee_city", consigneeCity);
    fd.append("consignee_state", consigneeState);
    fd.append("consignee_zip", consigneeZip);
    fd.append("delivery_window", deliveryWindow);
    fd.append("delivery_instructions", deliveryInstructions);

    fd.append("commodity", commodity);
    fd.append("quantity", quantity);
    fd.append("handling_units_type", handlingUnitsType);
    fd.append("length_in", lengthIn);
    fd.append("width_in", widthIn);
    fd.append("height_in", heightIn);
    fd.append("weight_lbs", weightLbs);
    fd.append("nmfc_code", nmfcCode);
    fd.append("freight_class", freightClass);
    fd.append("hazmat", hazmat ? "yes" : "no");
    fd.append("special_handling", specialHandling);

    fd.append("driver_assist_required", driverAssistRequired ? "yes" : "no");
    fd.append("tarp_required", tarpRequired ? "yes" : "no");
    fd.append("permits_required", permitsRequired ? "yes" : "no");
    fd.append("escort_required", escortRequired ? "yes" : "no");
    fd.append("rigging_required", riggingRequired ? "yes" : "no");
    fd.append("appointment_required", appointmentRequired ? "yes" : "no");
    fd.append("special_instructions", specialInstructions);

    fd.append("dispatch_notes", dispatchNotes);
    return fd;
  }

  function onSaveDraft() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await saveBolDraft(buildFormData());
        setNotice("Draft saved.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  function onBuildPreview() {
    setError(null);
    setNotice(null);
    setBuilding(true);
    startTransition(async () => {
      try {
        const data = await buildBolPreview(buildFormData());
        setPreview({
          to: data.to,
          from: data.from,
          replyTo: data.replyTo,
          subject: data.subject,
          preheader: data.preheader,
          html: data.html,
        });
        setStale(false);
        setBuilding(false);
        router.refresh();
      } catch (e) {
        setBuilding(false);
        setError(e instanceof Error ? e.message : "Preview failed.");
      }
    });
  }

  function onSend() {
    if (!preview || stale) return;
    setError(null);
    setNotice(null);
    if (
      !confirm(
        `Send Bill of Lading ${draft.bolNumber} to ${leadName}?\n\nThis sends the exact preview shown below and locks the record.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await sendBol(draft.id);
        setNotice("BOL sent.");
        setPreview(null);
        setStale(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed.");
      }
    });
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Bill of lading
        </p>
        <h2 className="mt-2 text-2xl font-display tracking-tight text-zinc-900 sm:text-3xl">
          {draft.bolNumber}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
          Shipment execution paperwork. NOT a pricing document — this is what
          rides with the freight and gets signed by shipper, driver, and
          consignee. Fields prefilled from the finalized quote; adjust as
          needed before building the preview.
        </p>
        <p className="mt-1 font-mono text-xs tracking-[0.12em] text-zinc-500 uppercase">
          Range quote <span className="text-zinc-700">{draft.rangeQuoteNumberLabel}</span>
          {draft.finalizedQuoteNumberLabel ? (
            <>
              <span aria-hidden className="mx-2 text-zinc-500">·</span>
              Finalized quote <span className="text-zinc-700">{draft.finalizedQuoteNumberLabel}</span>
            </>
          ) : null}
        </p>
      </header>

      <Section title="Identifiers">
        <Grid2>
          <Text label="Dispatch reference" value={dispatchReference} onChange={(v) => { setDispatchReference(v); markStale(); }} />
          <Field label="Issue date">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => { setIssueDate(e.target.value); markStale(); }}
              className={inputCls}
            />
          </Field>
        </Grid2>
      </Section>

      <Section title="Shipper (from)">
        <Grid2>
          <Text label="Company" value={shipperCompany} onChange={(v) => { setShipperCompany(v); markStale(); }} />
          <Text label="Contact name" value={shipperContactName} onChange={(v) => { setShipperContactName(v); markStale(); }} />
          <Text label="Phone" type="tel" value={shipperContactPhone} onChange={(v) => { setShipperContactPhone(v); markStale(); }} />
          <Text label="Email" type="email" value={shipperContactEmail} onChange={(v) => { setShipperContactEmail(v); markStale(); }} />
        </Grid2>
        <Text label="Address line 1" value={shipperAddressLine1} onChange={(v) => { setShipperAddressLine1(v); markStale(); }} />
        <Text label="Address line 2" value={shipperAddressLine2} onChange={(v) => { setShipperAddressLine2(v); markStale(); }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Text label="City" value={shipperCity} onChange={(v) => { setShipperCity(v); markStale(); }} />
          <Text label="State" value={shipperState} onChange={(v) => { setShipperState(v); markStale(); }} />
          <Text label="ZIP" value={shipperZip} onChange={(v) => { setShipperZip(v); markStale(); }} />
        </div>
        <Text label="Pickup window" value={pickupWindow} onChange={(v) => { setPickupWindow(v); markStale(); }} placeholder="e.g. Tue 8am-2pm, appt required" />
        <Textarea label="Pickup instructions" value={pickupInstructions} onChange={(v) => { setPickupInstructions(v); markStale(); }} rows={2} />
      </Section>

      <Section title="Consignee (to)">
        <Grid2>
          <Text label="Company" value={consigneeCompany} onChange={(v) => { setConsigneeCompany(v); markStale(); }} />
          <Text label="Contact name" value={consigneeContactName} onChange={(v) => { setConsigneeContactName(v); markStale(); }} />
          <Text label="Phone" type="tel" value={consigneeContactPhone} onChange={(v) => { setConsigneeContactPhone(v); markStale(); }} />
          <Text label="Email" type="email" value={consigneeContactEmail} onChange={(v) => { setConsigneeContactEmail(v); markStale(); }} />
        </Grid2>
        <Text label="Address line 1" value={consigneeAddressLine1} onChange={(v) => { setConsigneeAddressLine1(v); markStale(); }} />
        <Text label="Address line 2" value={consigneeAddressLine2} onChange={(v) => { setConsigneeAddressLine2(v); markStale(); }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Text label="City" value={consigneeCity} onChange={(v) => { setConsigneeCity(v); markStale(); }} />
          <Text label="State" value={consigneeState} onChange={(v) => { setConsigneeState(v); markStale(); }} />
          <Text label="ZIP" value={consigneeZip} onChange={(v) => { setConsigneeZip(v); markStale(); }} />
        </div>
        <Text label="Delivery window" value={deliveryWindow} onChange={(v) => { setDeliveryWindow(v); markStale(); }} placeholder="e.g. Thu after 10am, appt confirmed" />
        <Textarea label="Delivery instructions" value={deliveryInstructions} onChange={(v) => { setDeliveryInstructions(v); markStale(); }} rows={2} />
      </Section>

      <Section title="Freight description">
        <Text label="Commodity" value={commodity} onChange={(v) => { setCommodity(v); markStale(); }} placeholder="What is being shipped" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberField label="Quantity" value={quantity} onChange={(v) => { setQuantity(v); markStale(); }} />
          <Text label="Units type" value={handlingUnitsType} onChange={(v) => { setHandlingUnitsType(v); markStale(); }} placeholder="Skids, crates..." />
          <NumberField label="Weight (lbs)" value={weightLbs} onChange={(v) => { setWeightLbs(v); markStale(); }} step="0.01" />
          <div />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <NumberField label='Length (in)' value={lengthIn} onChange={(v) => { setLengthIn(v); markStale(); }} step="0.01" />
          <NumberField label='Width (in)' value={widthIn} onChange={(v) => { setWidthIn(v); markStale(); }} step="0.01" />
          <NumberField label='Height (in)' value={heightIn} onChange={(v) => { setHeightIn(v); markStale(); }} step="0.01" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Text label="NMFC code" value={nmfcCode} onChange={(v) => { setNmfcCode(v); markStale(); }} placeholder="optional" />
          <Text label="Freight class" value={freightClass} onChange={(v) => { setFreightClass(v); markStale(); }} placeholder="optional" />
          <Field label="Hazmat">
            <Checkbox label="Hazardous materials" checked={hazmat} onChange={(v) => { setHazmat(v); markStale(); }} />
          </Field>
        </div>
        <Textarea label="Special handling" value={specialHandling} onChange={(v) => { setSpecialHandling(v); markStale(); }} rows={2} placeholder="Securement, fragile, etc." />
      </Section>

      <Section title="Operational handling">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Checkbox label="Driver assist" checked={driverAssistRequired} onChange={(v) => { setDriverAssistRequired(v); markStale(); }} />
          <Checkbox label="Tarp required" checked={tarpRequired} onChange={(v) => { setTarpRequired(v); markStale(); }} />
          <Checkbox label="Permits required" checked={permitsRequired} onChange={(v) => { setPermitsRequired(v); markStale(); }} />
          <Checkbox label="Escort required" checked={escortRequired} onChange={(v) => { setEscortRequired(v); markStale(); }} />
          <Checkbox label="Rigging required" checked={riggingRequired} onChange={(v) => { setRiggingRequired(v); markStale(); }} />
          <Checkbox label="Appointment required" checked={appointmentRequired} onChange={(v) => { setAppointmentRequired(v); markStale(); }} />
        </div>
        <Textarea label="Special instructions" value={specialInstructions} onChange={(v) => { setSpecialInstructions(v); markStale(); }} rows={3} placeholder="Anything driver / dispatch / shipper needs to know on execution." />
      </Section>

      <Section title="Dispatch notes (optional)">
        <Textarea label="Dispatch notes" value={dispatchNotes} onChange={(v) => { setDispatchNotes(v); markStale(); }} rows={3} placeholder="Free-form notes for the driver / dispatch team." />
      </Section>

      {notice ? (
        <p role="status" className="font-mono text-xs tracking-[0.12em] text-green-800 uppercase">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="flex items-start gap-3 border border-red-300 bg-red-50 p-4">
          <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600" />
          <p className="text-sm leading-relaxed text-red-800">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isPending}
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending && !building ? "Working..." : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onBuildPreview}
          disabled={isPending}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {building ? "Building..." : preview ? "Rebuild preview" : "Build preview"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-4 pt-2">
          {stale ? (
            <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 p-4">
              <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-amber-500" />
              <p className="text-sm leading-relaxed text-amber-900">
                Preview is stale - rebuild before sending. The composer fields have
                changed since this preview was built; Send is disabled until you rebuild.
              </p>
            </div>
          ) : null}

          <EmailPreviewPanel preview={preview} />

          <div
            className={
              "border p-4 sm:p-5 " +
              (stale ? "border-zinc-200 bg-zinc-50" : "border-red-300 bg-red-50/20")
            }
          >
            <p
              className={
                "font-mono text-xs tracking-[0.12em] uppercase " +
                (stale ? "text-zinc-500" : "text-red-700")
              }
            >
              {stale ? "Send disabled" : "Ready to send"}
            </p>
            <p
              className={
                "mt-2 text-sm leading-relaxed " +
                (stale ? "text-zinc-600" : "text-red-800")
              }
            >
              {stale ? (
                <>Rebuild the preview to enable Send.</>
              ) : (
                <>
                  The BOL above is exactly what {leadName} will receive. Once sent,
                  this draft is locked as the historical bill of lading. Advance the
                  shipment status manually as the load moves through execution.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onSend}
                disabled={isPending || stale}
                className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && !building ? "Sending..." : "Send BOL"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Layout / input primitives ───────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-200 bg-zinc-100 p-5 sm:p-6">
      <h3 className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
        {title}
      </h3>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </Field>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${inputCls} resize-y`}
      />
    </Field>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border border-zinc-200 bg-zinc-50 px-3 py-2.5 transition-colors hover:border-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-red-600"
      />
      <span className="font-mono text-xs tracking-[0.12em] text-zinc-800 uppercase">
        {label}
      </span>
    </label>
  );
}
