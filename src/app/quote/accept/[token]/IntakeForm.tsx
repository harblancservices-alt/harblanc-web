"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveIntakeProgress,
  submitIntake,
  type IntakeSaveResult,
} from "./actions";

/**
 * Shipment finalization intake — single-page sectioned form, mobile
 * first. Save Progress persists partial state; Submit flips status to
 * 'submitted' and routes the customer to a confirmation view.
 *
 * No file uploads in this cut — reference URLs only. Adding uploads
 * later means wiring a Supabase Storage bucket scoped by token.
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
  pickupWindow: string;
  deliveryCompany: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  deliveryContactEmail: string;
  deliveryAddressLine1: string;
  deliveryAddressLine2: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string;
  deliveryWindow: string;
  commodityDetails: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  exactWeightLbs: string;
  loadingResponsibility: string;
  unloadingResponsibility: string;
  specialRequirements: string;
  referenceLinks: string;
  notes: string;
};

const labelCls =
  "block font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase";
const inputCls =
  "mt-2 block w-full bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-base text-zinc-100 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none";
const sectionCls =
  "border border-neutral-800 bg-neutral-900/40 p-5 sm:p-6";

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
}: {
  token: string;
  defaults: IntakeFormDefaults;
  initialStatus: "in_progress" | "submitted" | "new";
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
      handleResult(result, "Progress saved. You can come back to this link.");
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
        "Submitted. Dispatch will review and follow up with confirmation.",
      );
    });
  }

  if (status === "submitted") {
    return (
      <div className="border-2 border-green-700 bg-green-950/30 p-6 sm:p-8">
        <p className="font-mono text-[10px] tracking-[0.22em] text-green-300 uppercase">
          Submitted
        </p>
        <h2 className="mt-3 text-2xl font-display tracking-tight text-white sm:text-3xl">
          Shipment details received.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-green-100">
          Dispatch will review the finalized details and follow up to confirm
          the booking. You&rsquo;ll get a separate confirmation email once the
          truck is locked. If anything urgent comes up before then, reply to
          the original quote email or call the dispatch number on it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Section title="Pickup">
        <Grid>
          <Field label="Pickup company" name="pickup_company" defaultValue={defaults.pickupCompany} />
          <Field label="Pickup contact" name="pickup_contact_name" defaultValue={defaults.pickupContactName} />
          <Field label="Pickup phone" name="pickup_contact_phone" type="tel" defaultValue={defaults.pickupContactPhone} />
          <Field label="Pickup email" name="pickup_contact_email" type="email" defaultValue={defaults.pickupContactEmail} />
        </Grid>
        <Field label="Address line 1" name="pickup_address_line1" defaultValue={defaults.pickupAddressLine1} />
        <Field label="Address line 2" name="pickup_address_line2" defaultValue={defaults.pickupAddressLine2} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="City" name="pickup_city" defaultValue={defaults.pickupCity} />
          <Field label="State" name="pickup_state" defaultValue={defaults.pickupState} />
          <Field label="ZIP" name="pickup_zip" defaultValue={defaults.pickupZip} />
        </div>
        <Field label="Pickup window" name="pickup_window" type="date" defaultValue={defaults.pickupWindow} />
      </Section>

      <Section title="Delivery">
        <Grid>
          <Field label="Delivery company" name="delivery_company" defaultValue={defaults.deliveryCompany} />
          <Field label="Delivery contact" name="delivery_contact_name" defaultValue={defaults.deliveryContactName} />
          <Field label="Delivery phone" name="delivery_contact_phone" type="tel" defaultValue={defaults.deliveryContactPhone} />
          <Field label="Delivery email" name="delivery_contact_email" type="email" defaultValue={defaults.deliveryContactEmail} />
        </Grid>
        <Field label="Address line 1" name="delivery_address_line1" defaultValue={defaults.deliveryAddressLine1} />
        <Field label="Address line 2" name="delivery_address_line2" defaultValue={defaults.deliveryAddressLine2} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="City" name="delivery_city" defaultValue={defaults.deliveryCity} />
          <Field label="State" name="delivery_state" defaultValue={defaults.deliveryState} />
          <Field label="ZIP" name="delivery_zip" defaultValue={defaults.deliveryZip} />
        </div>
        <Field label="Delivery window" name="delivery_window" type="date" defaultValue={defaults.deliveryWindow} />
      </Section>

      <Section title="Shipment">
        <Textarea
          label="Commodity details"
          name="commodity_details"
          defaultValue={defaults.commodityDetails}
          rows={3}
          placeholder="What is it, condition, packaging, anything unusual."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Length (in)" name="length_in" type="number" defaultValue={defaults.lengthIn} />
          <Field label="Width (in)" name="width_in" type="number" defaultValue={defaults.widthIn} />
          <Field label="Height (in)" name="height_in" type="number" defaultValue={defaults.heightIn} />
          <Field label="Exact weight (lbs)" name="exact_weight_lbs" type="number" defaultValue={defaults.exactWeightLbs} />
        </div>
      </Section>

      <Section title="Logistics">
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
        <Textarea
          label="Special requirements"
          name="special_requirements"
          defaultValue={defaults.specialRequirements}
          rows={3}
          placeholder="Escorts, permits, tarping, chains, hazmat, non-running condition, etc."
        />
      </Section>

      <Section title="Notes & links">
        <Textarea
          label="Reference links (photos, BOL, spec sheets — one per line)"
          name="reference_links"
          defaultValue={defaults.referenceLinks}
          rows={3}
          placeholder="https://…"
        />
        <Textarea
          label="Notes for dispatch"
          name="notes"
          defaultValue={defaults.notes}
          rows={3}
          placeholder="Anything else dispatch should know before locking the truck."
        />
      </Section>

      {notice ? (
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.14em] text-green-400 uppercase"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border border-red-700 bg-red-950/30 p-4"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
          />
          <p className="text-sm leading-relaxed text-red-200">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-neutral-800 pt-6 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={isPending}
          className="btn-outline-cut inline-flex items-center justify-center px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Working…" : "Save progress"}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isPending ? "Submitting…" : "Submit for dispatch review"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={sectionCls}>
      <h2 className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
        {title}
      </h2>
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
