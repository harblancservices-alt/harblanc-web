"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveFinalizedQuoteDraft,
  buildFinalizedQuotePreview,
  sendFinalizedQuote,
} from "../finalized-quote-actions";
import {
  EmailPreviewPanel,
  type EmailPreviewData,
} from "./EmailPreviewPanel";

/**
 * Finalized Quote / Rate Confirmation Composer.
 *
 * Mirrors the EstimateComposer workflow conceptually (Save Draft →
 * Build Preview → Send, with preview/send byte parity) but the document
 * is much denser: pickup snapshot, delivery snapshot, freight, ops
 * requirements, exact pricing (not range), policies, agreement language.
 *
 * Each draft corresponds to a single finalized_quotes row. The partial
 * unique index in the database guarantees only one open draft per
 * dispatch_estimate at a time; sending the draft flips sent_at and frees
 * the slot for a future re-issue if scope changes.
 *
 * The composer fields persist to the same row Build Preview renders
 * from, so the email Brent reviews is byte-identical to what the
 * customer eventually receives.
 */

export type FinalizedQuoteAccessorial = {
  label: string;
  amount: number;
};

export type FinalizedQuotePreviewSnapshot = {
  subject: string;
  preheader: string;
  html: string;
  to: string;
  from: string;
  replyTo: string;
  builtAt: string;
};

export type FinalizedQuoteDraft = {
  id: string;
  finalizedQuoteNumber: string;
  rangeQuoteNumberLabel: string;
  dispatchEstimateId: string;

  issueDate: string | null;
  expirationAt: string | null;
  paymentDueAt: string | null;

  pickupCompany: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  pickupContactEmail: string | null;
  pickupAddressLine1: string | null;
  pickupAddressLine2: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupZip: string | null;
  pickupWindow: string | null;
  pickupLoadingHours: string | null;

  deliveryCompany: string | null;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  deliveryContactEmail: string | null;
  deliveryAddressLine1: string | null;
  deliveryAddressLine2: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryZip: string | null;
  deliveryWindow: string | null;
  deliveryReceivingHours: string | null;

  commodity: string | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  exactWeightLbs: number | null;
  quantity: number | null;
  handlingType: string | null;
  runningCondition: string | null;
  securementRequirements: string | null;

  forkliftAvailable: boolean | null;
  driverAssistRequired: boolean | null;
  craneRequired: boolean | null;
  permitsRequired: boolean | null;
  escortRequired: boolean | null;
  tarpRequired: boolean | null;
  specialInstructions: string | null;

  linehaul: number | null;
  fuelSurcharge: number | null;
  permitsFee: number | null;
  accessorials: FinalizedQuoteAccessorial[];
  totalAmount: number | null;

  detentionPolicy: string | null;
  tonuPolicy: string | null;
  paymentInstructions: string | null;
  dispatchConfirmationStatement: string | null;
  schedulingStatement: string | null;
  acceptanceAcknowledgement: string | null;

  sentAt: string | null;
  sentEmailId: string | null;
  preview: FinalizedQuotePreviewSnapshot | null;
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
function triToInput(v: boolean | null | undefined): "" | "yes" | "no" {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function FinalizedQuoteComposer({
  quoteRequestId,
  leadName,
  draft,
}: {
  quoteRequestId: string;
  leadName: string;
  draft: FinalizedQuoteDraft;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  // ── Date fields ──────────────────────────────────────────────────────
  const [expirationAt, setExpirationAt] = useState(strOrEmpty(draft.expirationAt));
  const [paymentDueAt, setPaymentDueAt] = useState(strOrEmpty(draft.paymentDueAt));

  // ── Pickup ───────────────────────────────────────────────────────────
  const [pickupCompany, setPickupCompany] = useState(strOrEmpty(draft.pickupCompany));
  const [pickupContactName, setPickupContactName] = useState(strOrEmpty(draft.pickupContactName));
  const [pickupContactPhone, setPickupContactPhone] = useState(strOrEmpty(draft.pickupContactPhone));
  const [pickupContactEmail, setPickupContactEmail] = useState(strOrEmpty(draft.pickupContactEmail));
  const [pickupAddressLine1, setPickupAddressLine1] = useState(strOrEmpty(draft.pickupAddressLine1));
  const [pickupAddressLine2, setPickupAddressLine2] = useState(strOrEmpty(draft.pickupAddressLine2));
  const [pickupCity, setPickupCity] = useState(strOrEmpty(draft.pickupCity));
  const [pickupState, setPickupState] = useState(strOrEmpty(draft.pickupState));
  const [pickupZip, setPickupZip] = useState(strOrEmpty(draft.pickupZip));
  const [pickupWindow, setPickupWindow] = useState(strOrEmpty(draft.pickupWindow));
  const [pickupLoadingHours, setPickupLoadingHours] = useState(strOrEmpty(draft.pickupLoadingHours));

  // ── Delivery ─────────────────────────────────────────────────────────
  const [deliveryCompany, setDeliveryCompany] = useState(strOrEmpty(draft.deliveryCompany));
  const [deliveryContactName, setDeliveryContactName] = useState(strOrEmpty(draft.deliveryContactName));
  const [deliveryContactPhone, setDeliveryContactPhone] = useState(strOrEmpty(draft.deliveryContactPhone));
  const [deliveryContactEmail, setDeliveryContactEmail] = useState(strOrEmpty(draft.deliveryContactEmail));
  const [deliveryAddressLine1, setDeliveryAddressLine1] = useState(strOrEmpty(draft.deliveryAddressLine1));
  const [deliveryAddressLine2, setDeliveryAddressLine2] = useState(strOrEmpty(draft.deliveryAddressLine2));
  const [deliveryCity, setDeliveryCity] = useState(strOrEmpty(draft.deliveryCity));
  const [deliveryState, setDeliveryState] = useState(strOrEmpty(draft.deliveryState));
  const [deliveryZip, setDeliveryZip] = useState(strOrEmpty(draft.deliveryZip));
  const [deliveryWindow, setDeliveryWindow] = useState(strOrEmpty(draft.deliveryWindow));
  const [deliveryReceivingHours, setDeliveryReceivingHours] = useState(strOrEmpty(draft.deliveryReceivingHours));

  // ── Freight ──────────────────────────────────────────────────────────
  const [commodity, setCommodity] = useState(strOrEmpty(draft.commodity));
  const [lengthIn, setLengthIn] = useState(numOrEmpty(draft.lengthIn));
  const [widthIn, setWidthIn] = useState(numOrEmpty(draft.widthIn));
  const [heightIn, setHeightIn] = useState(numOrEmpty(draft.heightIn));
  const [exactWeightLbs, setExactWeightLbs] = useState(numOrEmpty(draft.exactWeightLbs));
  const [quantity, setQuantity] = useState(numOrEmpty(draft.quantity));
  const [handlingType, setHandlingType] = useState(strOrEmpty(draft.handlingType));
  const [runningCondition, setRunningCondition] = useState(strOrEmpty(draft.runningCondition));
  const [securementRequirements, setSecurementRequirements] = useState(strOrEmpty(draft.securementRequirements));

  // ── Ops ──────────────────────────────────────────────────────────────
  const [forkliftAvailable, setForkliftAvailable] = useState<"" | "yes" | "no">(triToInput(draft.forkliftAvailable));
  const [driverAssistRequired, setDriverAssistRequired] = useState<"" | "yes" | "no">(triToInput(draft.driverAssistRequired));
  const [craneRequired, setCraneRequired] = useState<"" | "yes" | "no">(triToInput(draft.craneRequired));
  const [permitsRequired, setPermitsRequired] = useState<"" | "yes" | "no">(triToInput(draft.permitsRequired));
  const [escortRequired, setEscortRequired] = useState<"" | "yes" | "no">(triToInput(draft.escortRequired));
  const [tarpRequired, setTarpRequired] = useState<"" | "yes" | "no">(triToInput(draft.tarpRequired));
  const [specialInstructions, setSpecialInstructions] = useState(strOrEmpty(draft.specialInstructions));

  // ── Pricing ──────────────────────────────────────────────────────────
  const [linehaul, setLinehaul] = useState(numOrEmpty(draft.linehaul));
  const [fuelSurcharge, setFuelSurcharge] = useState(numOrEmpty(draft.fuelSurcharge));
  const [permitsFee, setPermitsFee] = useState(numOrEmpty(draft.permitsFee));
  const [accessorials, setAccessorials] = useState<FinalizedQuoteAccessorial[]>(
    draft.accessorials ?? [],
  );

  // ── Policies / agreement ─────────────────────────────────────────────
  //
  // Phase 5E declutter: these fields no longer have a form section in
  // the composer — they're not rendered in the new dispatch-invoice
  // email body. The values still round-trip through the action so any
  // existing data is preserved on the row, and a future Terms
  // acknowledgement layer can pick them up. Plain consts (no setters)
  // because nothing in the form mutates them any more.
  const detentionPolicy = strOrEmpty(draft.detentionPolicy);
  const tonuPolicy = strOrEmpty(draft.tonuPolicy);
  const paymentInstructions = strOrEmpty(draft.paymentInstructions);
  const dispatchConfirmationStatement = strOrEmpty(draft.dispatchConfirmationStatement);
  const schedulingStatement = strOrEmpty(draft.schedulingStatement);
  const acceptanceAcknowledgement = strOrEmpty(draft.acceptanceAcknowledgement);

  // ── Preview snapshot mirror ──────────────────────────────────────────
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

  const liveTotal = useMemo(() => {
    const a = Number(linehaul);
    const f = Number(fuelSurcharge);
    const p = Number(permitsFee);
    const aValid = Number.isFinite(a) ? a : 0;
    const fValid = Number.isFinite(f) ? f : 0;
    const pValid = Number.isFinite(p) ? p : 0;
    const x = accessorials.reduce((sum, ax) => sum + (ax.amount ?? 0), 0);
    return Number((aValid + fValid + pValid + x).toFixed(2));
  }, [linehaul, fuelSurcharge, permitsFee, accessorials]);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("finalized_quote_id", draft.id);
    fd.append("quote_request_id", quoteRequestId);

    fd.append("expiration_at", expirationAt);
    fd.append("payment_due_at", paymentDueAt);

    // pickup
    fd.append("pickup_company", pickupCompany);
    fd.append("pickup_contact_name", pickupContactName);
    fd.append("pickup_contact_phone", pickupContactPhone);
    fd.append("pickup_contact_email", pickupContactEmail);
    fd.append("pickup_address_line1", pickupAddressLine1);
    fd.append("pickup_address_line2", pickupAddressLine2);
    fd.append("pickup_city", pickupCity);
    fd.append("pickup_state", pickupState);
    fd.append("pickup_zip", pickupZip);
    fd.append("pickup_window", pickupWindow);
    fd.append("pickup_loading_hours", pickupLoadingHours);

    // delivery
    fd.append("delivery_company", deliveryCompany);
    fd.append("delivery_contact_name", deliveryContactName);
    fd.append("delivery_contact_phone", deliveryContactPhone);
    fd.append("delivery_contact_email", deliveryContactEmail);
    fd.append("delivery_address_line1", deliveryAddressLine1);
    fd.append("delivery_address_line2", deliveryAddressLine2);
    fd.append("delivery_city", deliveryCity);
    fd.append("delivery_state", deliveryState);
    fd.append("delivery_zip", deliveryZip);
    fd.append("delivery_window", deliveryWindow);
    fd.append("delivery_receiving_hours", deliveryReceivingHours);

    // freight
    fd.append("commodity", commodity);
    fd.append("length_in", lengthIn);
    fd.append("width_in", widthIn);
    fd.append("height_in", heightIn);
    fd.append("exact_weight_lbs", exactWeightLbs);
    fd.append("quantity", quantity);
    fd.append("handling_type", handlingType);
    fd.append("running_condition", runningCondition);
    fd.append("securement_requirements", securementRequirements);

    // ops
    fd.append("forklift_available", forkliftAvailable);
    fd.append("driver_assist_required", driverAssistRequired);
    fd.append("crane_required", craneRequired);
    fd.append("permits_required", permitsRequired);
    fd.append("escort_required", escortRequired);
    fd.append("tarp_required", tarpRequired);
    fd.append("special_instructions", specialInstructions);

    // pricing
    fd.append("linehaul", linehaul);
    fd.append("fuel_surcharge", fuelSurcharge);
    fd.append("permits_fee", permitsFee);
    for (const a of accessorials) {
      fd.append("accessorial_label", a.label);
      fd.append("accessorial_amount", String(a.amount));
    }

    // policies / agreement
    fd.append("detention_policy", detentionPolicy);
    fd.append("tonu_policy", tonuPolicy);
    fd.append("payment_instructions", paymentInstructions);
    fd.append("dispatch_confirmation_statement", dispatchConfirmationStatement);
    fd.append("scheduling_statement", schedulingStatement);
    fd.append("acceptance_acknowledgement", acceptanceAcknowledgement);

    return fd;
  }

  function onSaveDraft() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await saveFinalizedQuoteDraft(buildFormData());
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
        const data = await buildFinalizedQuotePreview(buildFormData());
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
        `Send finalized quote ${draft.finalizedQuoteNumber} to ${leadName}?\n\nThis sends the exact preview shown below and locks the record.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await sendFinalizedQuote(draft.id);
        setNotice("Finalized quote sent.");
        setPreview(null);
        setStale(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed.");
      }
    });
  }

  function addAccessorial() {
    setAccessorials((prev) => [...prev, { label: "", amount: 0 }]);
    markStale();
  }
  function updateAccessorial(i: number, patch: Partial<FinalizedQuoteAccessorial>) {
    setAccessorials((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );
    markStale();
  }
  function removeAccessorial(i: number) {
    setAccessorials((prev) => prev.filter((_, idx) => idx !== i));
    markStale();
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="font-mono text-xs tracking-[0.12em] text-red-600 uppercase">
          Finalized quote
        </p>
        <h2 className="mt-2 text-2xl font-display tracking-tight text-zinc-900 sm:text-3xl">
          {draft.finalizedQuoteNumber}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-700">
          This is the formal rate confirmation. Exact pricing, dispatch-confirmed
          scope. Fields prefilled from the shipment intake; adjust as needed before
          building the preview. The customer receives exactly what the preview shows.
        </p>
        <p className="mt-1 font-mono text-xs tracking-[0.12em] text-zinc-500 uppercase">
          References range quote <span className="text-zinc-700">{draft.rangeQuoteNumberLabel}</span>
        </p>
      </header>

      {/* ── Dates ──────────────────────────────────────────────────────── */}
      <Section title="Dates">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Valid through">
            <input
              type="date"
              value={expirationAt}
              onChange={(e) => {
                setExpirationAt(e.target.value);
                markStale();
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Payment due by">
            <input
              type="date"
              value={paymentDueAt}
              onChange={(e) => {
                setPaymentDueAt(e.target.value);
                markStale();
              }}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* ── Pickup ─────────────────────────────────────────────────────── */}
      <Section title="Pickup">
        <Grid2>
          <Text label="Company" value={pickupCompany} onChange={(v) => { setPickupCompany(v); markStale(); }} />
          <Text label="Contact name" value={pickupContactName} onChange={(v) => { setPickupContactName(v); markStale(); }} />
          <Text label="Phone" type="tel" value={pickupContactPhone} onChange={(v) => { setPickupContactPhone(v); markStale(); }} />
          <Text label="Email" type="email" value={pickupContactEmail} onChange={(v) => { setPickupContactEmail(v); markStale(); }} />
        </Grid2>
        <Text label="Address line 1" value={pickupAddressLine1} onChange={(v) => { setPickupAddressLine1(v); markStale(); }} />
        <Text label="Address line 2" value={pickupAddressLine2} onChange={(v) => { setPickupAddressLine2(v); markStale(); }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Text label="City" value={pickupCity} onChange={(v) => { setPickupCity(v); markStale(); }} />
          <Text label="State" value={pickupState} onChange={(v) => { setPickupState(v); markStale(); }} />
          <Text label="ZIP" value={pickupZip} onChange={(v) => { setPickupZip(v); markStale(); }} />
        </div>
        <Text label="Pickup window" value={pickupWindow} onChange={(v) => { setPickupWindow(v); markStale(); }} placeholder="e.g. Tue 8am–2pm, appt required" />
        <Text label="Loading hours" value={pickupLoadingHours} onChange={(v) => { setPickupLoadingHours(v); markStale(); }} placeholder="e.g. Mon–Fri 7am–4pm" />
      </Section>

      {/* ── Delivery ───────────────────────────────────────────────────── */}
      <Section title="Delivery">
        <Grid2>
          <Text label="Company" value={deliveryCompany} onChange={(v) => { setDeliveryCompany(v); markStale(); }} />
          <Text label="Contact name" value={deliveryContactName} onChange={(v) => { setDeliveryContactName(v); markStale(); }} />
          <Text label="Phone" type="tel" value={deliveryContactPhone} onChange={(v) => { setDeliveryContactPhone(v); markStale(); }} />
          <Text label="Email" type="email" value={deliveryContactEmail} onChange={(v) => { setDeliveryContactEmail(v); markStale(); }} />
        </Grid2>
        <Text label="Address line 1" value={deliveryAddressLine1} onChange={(v) => { setDeliveryAddressLine1(v); markStale(); }} />
        <Text label="Address line 2" value={deliveryAddressLine2} onChange={(v) => { setDeliveryAddressLine2(v); markStale(); }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Text label="City" value={deliveryCity} onChange={(v) => { setDeliveryCity(v); markStale(); }} />
          <Text label="State" value={deliveryState} onChange={(v) => { setDeliveryState(v); markStale(); }} />
          <Text label="ZIP" value={deliveryZip} onChange={(v) => { setDeliveryZip(v); markStale(); }} />
        </div>
        <Text label="Delivery window" value={deliveryWindow} onChange={(v) => { setDeliveryWindow(v); markStale(); }} placeholder="e.g. Thu after 10am, appt confirmed" />
        <Text label="Receiving hours" value={deliveryReceivingHours} onChange={(v) => { setDeliveryReceivingHours(v); markStale(); }} placeholder="e.g. Mon–Fri 8am–4pm" />
      </Section>

      {/* ── Freight ────────────────────────────────────────────────────── */}
      <Section title="Freight">
        <Text label="Commodity" value={commodity} onChange={(v) => { setCommodity(v); markStale(); }} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberField label='Length (in)' value={lengthIn} onChange={(v) => { setLengthIn(v); markStale(); }} />
          <NumberField label='Width (in)' value={widthIn} onChange={(v) => { setWidthIn(v); markStale(); }} />
          <NumberField label='Height (in)' value={heightIn} onChange={(v) => { setHeightIn(v); markStale(); }} />
          <NumberField label='Exact weight (lbs)' value={exactWeightLbs} onChange={(v) => { setExactWeightLbs(v); markStale(); }} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField label="Quantity" value={quantity} onChange={(v) => { setQuantity(v); markStale(); }} />
          <Text label="Handling type" value={handlingType} onChange={(v) => { setHandlingType(v); markStale(); }} placeholder="e.g. Crated, Skidded, Loose" />
          <Text label="Running condition" value={runningCondition} onChange={(v) => { setRunningCondition(v); markStale(); }} placeholder="e.g. Running, Non-running, N/A" />
        </div>
        <Textarea label="Securement requirements" value={securementRequirements} onChange={(v) => { setSecurementRequirements(v); markStale(); }} rows={2} placeholder="Chains, straps, corner protectors, etc." />
      </Section>

      {/* ── Operational requirements ───────────────────────────────────── */}
      <Section title="Operational requirements">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <TriBool label="Forklift available" value={forkliftAvailable} onChange={(v) => { setForkliftAvailable(v); markStale(); }} />
          <TriBool label="Driver assist required" value={driverAssistRequired} onChange={(v) => { setDriverAssistRequired(v); markStale(); }} />
          <TriBool label="Crane / rigging" value={craneRequired} onChange={(v) => { setCraneRequired(v); markStale(); }} />
          <TriBool label="Permits" value={permitsRequired} onChange={(v) => { setPermitsRequired(v); markStale(); }} />
          <TriBool label="Escort" value={escortRequired} onChange={(v) => { setEscortRequired(v); markStale(); }} />
          <TriBool label="Tarp required" value={tarpRequired} onChange={(v) => { setTarpRequired(v); markStale(); }} />
        </div>
        <Textarea label="Special instructions" value={specialInstructions} onChange={(v) => { setSpecialInstructions(v); markStale(); }} rows={3} placeholder="Anything dispatch / driver / pickup contact needs to know." />
      </Section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <Section title="Pricing">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField label="Linehaul (USD)" required value={linehaul} onChange={(v) => { setLinehaul(v); markStale(); }} step="0.01" />
          <NumberField label="Fuel surcharge (USD)" value={fuelSurcharge} onChange={(v) => { setFuelSurcharge(v); markStale(); }} step="0.01" />
          <NumberField label="Permits (USD)" value={permitsFee} onChange={(v) => { setPermitsFee(v); markStale(); }} step="0.01" />
        </div>

        <div className="space-y-3">
          <p className={labelCls}>Accessorials</p>
          {accessorials.length === 0 ? (
            <p className="font-mono text-xs text-zinc-500">
              No accessorials. Add one for tarp, escort, layover, lumper, etc.
            </p>
          ) : (
            <ul className="space-y-2">
              {accessorials.map((a, i) => (
                <li key={i} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                  <input
                    type="text"
                    value={a.label}
                    onChange={(e) => updateAccessorial(i, { label: e.target.value })}
                    placeholder="e.g. Tarp"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={Number.isFinite(a.amount) ? String(a.amount) : ""}
                    onChange={(e) => updateAccessorial(i, { amount: Number(e.target.value) || 0 })}
                    placeholder="0.00"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeAccessorial(i)}
                    className="border border-zinc-300 bg-white px-3 py-2.5 font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase hover:text-red-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={addAccessorial}
            className="border border-zinc-300 bg-white px-3 py-2 font-mono text-xs tracking-[0.12em] text-zinc-700 uppercase hover:border-zinc-400 hover:text-zinc-900"
          >
            + Add accessorial
          </button>
        </div>

        {/* Live total preview */}
        <div className="flex items-center justify-between border border-red-300 bg-red-50/20 px-4 py-3">
          <span className="font-mono text-xs tracking-[0.12em] text-red-700 uppercase">
            Total final rate
          </span>
          <span className="font-mono text-xl font-semibold text-zinc-900">
            {Number.isFinite(liveTotal) ? formatUsd(liveTotal) : "—"}
          </span>
        </div>
      </Section>

      {/* Policy + agreement sections removed in Phase 5E declutter.
          The detention / TONU / payment-instructions / confirmation /
          scheduling / acceptance values still round-trip through the
          form data (read-only consts above) so existing rows are
          preserved, but the email no longer renders them in the body
          — those policies belong in a separate Terms acknowledgement
          surface, not inside the dispatch invoice. */}

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
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900 transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending && !building ? "Working…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={onBuildPreview}
          disabled={isPending}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900 transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {building ? "Building…" : preview ? "Rebuild preview" : "Build preview"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-4 pt-2">
          {stale ? (
            <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 p-4">
              <span aria-hidden className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-amber-500" />
              <p className="text-sm leading-relaxed text-amber-900">
                Preview is stale — rebuild before sending. The composer fields have
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
                  The email above is exactly what {leadName} will receive. Once sent,
                  this draft is locked as the historical rate confirmation.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onSend}
                disabled={isPending || stale}
                className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900 transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending && !building ? "Sending…" : "Send finalized quote"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Small layout / input primitives ─────────────────────────────────────

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
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
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
  required,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  step?: string;
}) {
  return (
    <Field label={label} required={required}>
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

function TriBool({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "" | "yes" | "no";
  onChange: (v: "" | "yes" | "no") => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        {(["yes", "no", ""] as const).map((opt) => {
          const active = opt === value;
          const isYes = opt === "yes";
          const isNo = opt === "no";
          const display = isYes ? "Yes" : isNo ? "No" : "—";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={
                "flex-1 border px-2 py-2 font-mono text-xs tracking-[0.12em] uppercase transition-colors " +
                (active
                  ? isYes
                    ? "border-green-300 bg-green-50 text-green-800"
                    : isNo
                      ? "border-red-300 bg-red-50 text-red-800"
                      : "border-zinc-400 bg-white text-zinc-800"
                  : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900")
              }
            >
              {display}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
