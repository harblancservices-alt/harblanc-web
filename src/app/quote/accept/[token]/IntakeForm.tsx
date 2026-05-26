"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveIntakeProgress,
  submitIntake,
  type IntakeSaveResult,
} from "./actions";
import { IntakeUploads, type IntakeUploadRow } from "./IntakeUploads";
import {
  AppointmentStatusSelect,
  DateWindowField,
  PhoneField,
  StateSelect,
} from "./intake-fields";

/**
 * Shipment finalization intake — single-page sectioned form, mobile
 * first. Save Progress persists partial state; Submit flips status to
 * 'submitted' and routes the customer to a confirmation view.
 *
 * Documents & Photos uploader lives INSIDE the editable branch of this
 * component, between the Shipment (commodity / dims / weight) section
 * and the Logistics section — i.e. on the Confirm Shipment Details
 * screen, before the submit button. When status flips to "submitted"
 * the editable branch is replaced by a success card and the uploader
 * disappears alongside the form, so files cannot be added after the
 * customer has confirmed. Uploads remain optional throughout — the
 * customer can submit with zero files attached.
 */

export type IntakeFormDefaults = {
  pickupCompany: string;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupContactEmail: string;
  pickupAddressLine1: string;
  pickupAddressLine2: string;
  pickupCity: string;
  pickupState: string;
  pickupZip: string;
  // Calendar window — start is the day the shipper has freight ready;
  // end (optional) is the last day they'll release it. Server actions
  // also derive a "{start} – {end}" string into the legacy pickup_window
  // text column so existing email / admin / FQ consumers keep working.
  pickupWindowStart: string;
  pickupWindowEnd: string;
  deliveryCompany: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  deliveryContactEmail: string;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  commodityDetails: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  exactWeightLbs: string;
  loadingResponsibility: string;
  unloadingResponsibility: string;
  // Customer's scheduling posture — see APPOINTMENT_STATUS_OPTIONS in
  // intake-fields.tsx. Stored as a stable code (e.g. "flexible").
  appointmentStatus: string;
  specialRequirements: string;
  referenceLinks: string;
  notes: string;
};

// Three-layer depth model with clearly distinct tonal steps:
//
//   Layer 1 — page shell      #050505  (~2% luminance, deepest)
//   Layer 2 — section cards   #1a1a1a  (~10%, +8 from page)
//   Layer 3 — editable inputs #2e2e2e  (~18%, +8 from card)
//
// Each step is ~8 luminance points apart so the layering is visible on
// any monitor, not theoretical. Cards drop the surround border in favor
// of the red 4px ID strip + a strong drop shadow. Inputs lift to
// #2e2e2e and carry a visible #3a3a3a border so they read unmistakably
// as editable wells inside their parent card. Input text is text-white
// for maximum readability; labels at zinc-300 stay clearly readable
// without shouting. py-3 keeps mobile tap targets thumb-friendly.
const labelCls =
  "block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300";
const inputCls =
  // Focus shifted from red-500 to red-600 — same brand red as the
  // accent strips, less neon under sustained focus. transition-colors
  // eases the border-color change instead of snapping, which reads as
  // premium operational interaction rather than a generic HTML field.
  "mt-2 block w-full border border-[#3a3a3a] bg-[#2e2e2e] px-3 py-3 text-base text-white placeholder:text-neutral-500 transition-colors focus:border-red-600 focus:outline-none";
// Section card chrome. Shadow softened from the prior 0.9-opacity 24px
// blur to 0.7-opacity 18px — tighter spread + lower opacity reads as
// premium operational paperwork elevation rather than dashboard widget.
const sectionCls =
  "border-l-4 border-l-red-600 bg-[#1a1a1a] p-5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-6";

const LOADING_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "driver_load", label: "Driver loads" },
  { value: "shipper_dock", label: "Loading dock available" },
  { value: "shipper_forklift", label: "Forklift available on site" },
  { value: "shipper_hand", label: "Hand load (no equipment)" },
  { value: "rigging_required", label: "Rigging / crane required" },
  { value: "other", label: "Other (note below)" },
];

const UNLOADING_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "driver_unload", label: "Driver unloads" },
  { value: "receiver_dock", label: "Receiver dock available" },
  { value: "receiver_forklift", label: "Forklift available on site" },
  { value: "receiver_hand", label: "Hand unload (no equipment)" },
  { value: "lumper", label: "Lumper service required" },
  { value: "rigging_required", label: "Rigging / crane required" },
  { value: "other", label: "Other (note below)" },
];

export function IntakeForm({
  token,
  defaults,
  initialStatus,
  initialUploads,
}: {
  token: string;
  defaults: IntakeFormDefaults;
  initialStatus: "in_progress" | "submitted" | "new";
  initialUploads: IntakeUploadRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<typeof initialStatus>(initialStatus);

  function buildFormData(form: HTMLFormElement): FormData {
    return new FormData(form);
  }

  function handleResult(result: IntakeSaveResult, successMessage: string) {
    if (result.ok) {
      setStatus(result.status);
      setNotice(successMessage);
      router.refresh();
    } else {
      setError(result.reason);
    }
  }

  function onSave(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    if (!form) return;
    setError(null);
    setNotice(null);
    const fd = buildFormData(form);
    startTransition(async () => {
      const result = await saveIntakeProgress(token, fd);
      handleResult(
        result,
        "Progress saved. This link stays valid — return any time before submitting.",
      );
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const fd = buildFormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitIntake(token, fd);
      handleResult(
        result,
        "Submitted. A dispatcher will review and follow up to coordinate pickup.",
      );
    });
  }

  if (status === "submitted") {
    return (
      <div className="border-l-4 border-l-green-500 bg-[#1a1a1a] p-6 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.7)] sm:p-8">
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-green-400">
          <span aria-hidden className="inline-block h-3 w-1 bg-green-500" />
          Submitted &middot; step 2 of 2
        </p>
        <h2 className="mt-3 text-2xl font-display tracking-tight text-white sm:text-3xl">
          Shipment details received.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-300">
          A dispatcher reviews the load, confirms equipment, and
          coordinates the pickup and delivery windows. You&rsquo;ll get
          a separate email once a truck is assigned and a scheduling
          call goes out. Reply to the original quote email or call
          dispatch directly if anything changes in the meantime.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 sm:space-y-7">
      <Section
        title="Pickup"
        subtitle="Origin point and shipper contact for the lane."
      >
        <Grid>
          <Field label="Company" name="pickup_company" defaultValue={defaults.pickupCompany} />
          <Field label="Contact" name="pickup_contact_name" defaultValue={defaults.pickupContactName} />
          <PhoneField
            label="Phone"
            name="pickup_contact_phone"
            defaultValue={defaults.pickupContactPhone}
          />
          <Field label="Email" name="pickup_contact_email" type="email" defaultValue={defaults.pickupContactEmail} />
        </Grid>
        <Field label="Address line 1" name="pickup_address_line1" defaultValue={defaults.pickupAddressLine1} />
        <Field label="Address line 2" name="pickup_address_line2" defaultValue={defaults.pickupAddressLine2} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="City" name="pickup_city" defaultValue={defaults.pickupCity} />
          <StateSelect
            label="State"
            name="pickup_state"
            defaultValue={defaults.pickupState}
          />
          <Field label="ZIP" name="pickup_zip" defaultValue={defaults.pickupZip} />
        </div>
        <DateWindowField
          label="Pickup window"
          startName="pickup_window_start"
          endName="pickup_window_end"
          startDefault={defaults.pickupWindowStart}
          endDefault={defaults.pickupWindowEnd}
        />
      </Section>

      <Section
        title="Delivery"
        subtitle="Destination point and consignee contact for the lane."
      >
        <Grid>
          <Field label="Company" name="delivery_company" defaultValue={defaults.deliveryCompany} />
          <Field label="Contact" name="delivery_contact_name" defaultValue={defaults.deliveryContactName} />
          <PhoneField
            label="Phone"
            name="delivery_contact_phone"
            defaultValue={defaults.deliveryContactPhone}
          />
          <Field label="Email" name="delivery_contact_email" type="email" defaultValue={defaults.deliveryContactEmail} />
        </Grid>
        <Field label="Address line 1" name="delivery_address_line1" defaultValue={defaults.deliveryAddressLine1} />
        <Field label="Address line 2" name="delivery_address_line2" defaultValue={defaults.deliveryAddressLine2} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="City" name="delivery_city" defaultValue={defaults.deliveryCity} />
          <StateSelect
            label="State"
            name="delivery_state"
            defaultValue={defaults.deliveryState}
          />
          <Field label="ZIP" name="delivery_zip" defaultValue={defaults.deliveryZip} />
        </div>
        <DateWindowField
          label="Delivery window"
          startName="delivery_window_start"
          endName="delivery_window_end"
          startDefault={defaults.deliveryWindowStart}
          endDefault={defaults.deliveryWindowEnd}
        />
      </Section>

      {/* Logistics now sits BEFORE Shipment. Operationally the customer
          decides how the freight will be handled (loading responsibility,
          scheduling posture, special requirements) before describing the
          freight itself — describing dimensions and weight is faster once
          the load/unload decisions are settled. */}
      <Section
        title="Logistics"
        subtitle="Handling responsibility, scheduling posture, and special requirements."
      >
        <SelectField
          label="Loading responsibility"
          name="loading_responsibility"
          defaultValue={defaults.loadingResponsibility}
          options={LOADING_OPTIONS}
        />
        <SelectField
          label="Unloading responsibility"
          name="unloading_responsibility"
          defaultValue={defaults.unloadingResponsibility}
          options={UNLOADING_OPTIONS}
        />
        {/* Customer's scheduling posture — dispatch confirms exact times
            by phone after intake/payment, so this form intentionally
            doesn't ask for hour-of-day. */}
        <AppointmentStatusSelect
          label="Scheduling"
          name="appointment_status"
          defaultValue={defaults.appointmentStatus}
        />
        <Textarea
          label="Special requirements"
          name="special_requirements"
          defaultValue={defaults.specialRequirements}
          rows={3}
          placeholder="Escorts, permits, tarping, chains, hazmat, non-running condition, etc."
        />
      </Section>

      <Section
        title="Shipment"
        subtitle="Commodity description, dimensions, and exact weight."
      >
        <Textarea
          label="Commodity details"
          name="commodity_details"
          defaultValue={defaults.commodityDetails}
          rows={3}
          placeholder="Commodity description, packaging, condition, anything unusual."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Length (in)" name="length_in" type="number" defaultValue={defaults.lengthIn} />
          <Field label="Width (in)" name="width_in" type="number" defaultValue={defaults.widthIn} />
          <Field label="Height (in)" name="height_in" type="number" defaultValue={defaults.heightIn} />
          <Field label="Exact weight (lbs)" name="exact_weight_lbs" type="number" defaultValue={defaults.exactWeightLbs} />
        </div>
      </Section>

      {/* Documents & Photos — final section. The Notes & links section
          that used to sit below this is gone; the customer's reference
          links input has moved INSIDE this section (rendered by
          IntakeUploads via referenceLinksDefault). The `notes` field
          and its `shipment_intake.notes` column are still supported on
          the server side — the customer-facing input was just removed.
          Submission of files goes through its own server action; the
          parent intake <form> never auto-submits from inside it. */}
      <IntakeUploads
        token={token}
        initialUploads={initialUploads}
        referenceLinksDefault={defaults.referenceLinks}
      />

      {notice ? (
        <p
          role="status"
          className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-green-400"
        >
          <span aria-hidden className="inline-block h-3 w-1 bg-green-500" />
          {notice}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-800 bg-red-950/40 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-[#1f1f1f] pt-7 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="inline-flex items-center justify-center border border-neutral-600 bg-transparent px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-zinc-100 transition-colors hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Working…" : "Save progress"}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center border border-red-700 bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Submitting…" : "Send to dispatch"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  /** Optional one-line dispatch descriptor rendered below the title in
   *  a quiet mono voice. Gives each card a freight-document header
   *  rhythm instead of bare section labels. */
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={sectionCls}>
      <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.18em] text-white">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1.5 font-mono text-[11px] leading-snug text-zinc-500">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  rows = 3,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={name}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        className={`${inputCls} resize-y`}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className={inputCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
