"use client";

import { useState } from "react";
import Link from "next/link";
import { company } from "@/lib/company";

/** Shape of a quote request — used by the form and (later) by the API. */
export type QuoteFormValues = {
  customerName: string;
  companyName: string;
  phone: string;
  email: string;
  pickupLocation: string;
  deliveryLocation: string;
  pickupDate: string;
  deliveryDate: string;
  commodity: string;
  weight: string;
  dimensions: string;
  equipment: string;
  urgency: string;
  specialInstructions: string;
};

const initialValues: QuoteFormValues = {
  customerName: "",
  companyName: "",
  phone: "",
  email: "",
  pickupLocation: "",
  deliveryLocation: "",
  pickupDate: "",
  deliveryDate: "",
  commodity: "",
  weight: "",
  dimensions: "",
  equipment: "",
  urgency: "",
  specialInstructions: "",
};

const equipmentOptions = [
  "Flatbed",
  "Step Deck",
  "Gooseneck",
  "Dovetail",
  "Dry Van",
  "Reefer",
  "Hotshot Pickup",
  "Lowboy",
  "Other / Not sure",
];

const urgencyOptions = [
  "Same day / ASAP",
  "This week",
  "Next week",
  "Flexible / no rush",
];

/* ---------- shared field styles, kept inline so there's no extra file ---------- */
const labelCls = "block text-sm font-medium text-zinc-200";
const requiredMark = (
  <span aria-hidden className="ml-0.5 text-red-500">
    *
  </span>
);
const fieldCls =
  "mt-1.5 block w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-600/30 sm:text-sm";

type Status = "idle" | "submitting" | "success";

export function QuoteForm() {
  const [values, setValues] = useState<QuoteFormValues>(initialValues);
  const [status, setStatus] = useState<Status>("idle");

  function update<K extends keyof QuoteFormValues>(
    key: K,
    value: QuoteFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");

    // Placeholder for the future API call.
    // When the backend is wired, replace this block with:
    //   const res = await fetch("/api/quote", { method: "POST", body: JSON.stringify(values) });
    //   if (!res.ok) { setStatus("idle"); return; }
    await new Promise((r) => setTimeout(r, 600));

    setStatus("success");
  }

  if (status === "success") {
    return <SuccessState onReset={() => {
      setValues(initialValues);
      setStatus("idle");
    }} />;
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate={false}
      className="space-y-10"
      aria-busy={status === "submitting"}
    >
      {/* Section: Contact info */}
      <Section title="Your contact info" eyebrow="01">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            id="customerName"
            label="Your name"
            required
          >
            <input
              id="customerName"
              name="customerName"
              type="text"
              required
              autoComplete="name"
              value={values.customerName}
              onChange={(e) => update("customerName", e.target.value)}
              className={fieldCls}
              placeholder="Jane Doe"
            />
          </Field>
          <Field id="companyName" label="Company">
            <input
              id="companyName"
              name="companyName"
              type="text"
              autoComplete="organization"
              value={values.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              className={fieldCls}
              placeholder="Acme Logistics (optional)"
            />
          </Field>
          <Field id="phone" label="Phone" required>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={fieldCls}
              placeholder="(555) 123-4567"
            />
          </Field>
          <Field id="email" label="Email" required>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              className={fieldCls}
              placeholder="you@company.com"
            />
          </Field>
        </div>
      </Section>

      {/* Section: Pickup & delivery */}
      <Section title="Pickup & delivery" eyebrow="02">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="pickupLocation" label="Pickup city, state" required>
            <input
              id="pickupLocation"
              name="pickupLocation"
              type="text"
              required
              value={values.pickupLocation}
              onChange={(e) => update("pickupLocation", e.target.value)}
              className={fieldCls}
              placeholder="Dallas, TX"
            />
          </Field>
          <Field id="deliveryLocation" label="Delivery city, state" required>
            <input
              id="deliveryLocation"
              name="deliveryLocation"
              type="text"
              required
              value={values.deliveryLocation}
              onChange={(e) => update("deliveryLocation", e.target.value)}
              className={fieldCls}
              placeholder="Phoenix, AZ"
            />
          </Field>
          <Field id="pickupDate" label="Pickup date" required>
            <input
              id="pickupDate"
              name="pickupDate"
              type="date"
              required
              value={values.pickupDate}
              onChange={(e) => update("pickupDate", e.target.value)}
              className={fieldCls}
            />
          </Field>
          <Field id="deliveryDate" label="Delivery date (if known)">
            <input
              id="deliveryDate"
              name="deliveryDate"
              type="date"
              value={values.deliveryDate}
              onChange={(e) => update("deliveryDate", e.target.value)}
              className={fieldCls}
            />
          </Field>
        </div>
      </Section>

      {/* Section: Load details */}
      <Section title="Load details" eyebrow="03">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="commodity" label="Commodity / load description" required className="sm:col-span-2">
            <input
              id="commodity"
              name="commodity"
              type="text"
              required
              value={values.commodity}
              onChange={(e) => update("commodity", e.target.value)}
              className={fieldCls}
              placeholder="Skid steer, palletized parts, machinery, etc."
            />
          </Field>
          <Field id="weight" label="Weight (lbs)" required>
            <input
              id="weight"
              name="weight"
              type="text"
              required
              inputMode="numeric"
              value={values.weight}
              onChange={(e) => update("weight", e.target.value)}
              className={fieldCls}
              placeholder="12,000"
            />
          </Field>
          <Field id="dimensions" label="Dimensions (L × W × H, if known)">
            <input
              id="dimensions"
              name="dimensions"
              type="text"
              value={values.dimensions}
              onChange={(e) => update("dimensions", e.target.value)}
              className={fieldCls}
              placeholder="20' × 8' × 8'"
            />
          </Field>
          <Field id="equipment" label="Equipment needed" required>
            <select
              id="equipment"
              name="equipment"
              required
              value={values.equipment}
              onChange={(e) => update("equipment", e.target.value)}
              className={fieldCls}
            >
              <option value="" disabled>
                Choose equipment
              </option>
              {equipmentOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
          <Field id="urgency" label="Urgency" required>
            <select
              id="urgency"
              name="urgency"
              required
              value={values.urgency}
              onChange={(e) => update("urgency", e.target.value)}
              className={fieldCls}
            >
              <option value="" disabled>
                How soon?
              </option>
              {urgencyOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Section: Special instructions */}
      <Section title="Special instructions" eyebrow="04">
        <Field id="specialInstructions" label="Anything else dispatch should know?">
          <textarea
            id="specialInstructions"
            name="specialInstructions"
            rows={4}
            value={values.specialInstructions}
            onChange={(e) => update("specialInstructions", e.target.value)}
            className={fieldCls}
            placeholder="Tarps required, escort needed, gate code, after-hours pickup, etc. (optional)"
          />
        </Field>
      </Section>

      {/* Submit */}
      <div className="flex flex-col items-stretch gap-3 border-t border-neutral-800 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500">
          Fields marked {requiredMark} are required. We&apos;ll get back to
          you from {company.dispatchEmail}.
        </p>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex items-center justify-center rounded-md bg-red-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {status === "submitting" ? "Sending..." : "Submit Quote Request"}
        </button>
      </div>
    </form>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-6">
      <legend className="w-full">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs font-semibold tracking-[0.2em] text-red-500">
            {eyebrow}
          </span>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required && requiredMark}
      </label>
      {children}
    </div>
  );
}

function SuccessState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-600/15 text-red-500">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-6 w-6"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-white">
        Quote request received.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
        Dispatch will reach out shortly from{" "}
        <span className="text-zinc-200">{company.dispatchEmail}</span> with
        pricing and availability. For anything urgent, call{" "}
        <span className="text-zinc-200">{company.dispatchPhone}</span>.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-neutral-500 hover:bg-neutral-800"
        >
          Back to home
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
        >
          Submit another quote
        </button>
      </div>
      {/* dev-only note while backend is not wired */}
      <p className="mt-6 text-xs text-zinc-600">
        Placeholder confirmation — backend wiring lands in a later phase.
      </p>
    </div>
  );
}
