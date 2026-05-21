"use client";

import { useState } from "react";
import Link from "next/link";
import { company } from "@/lib/company";

/** Shape of a quote request — used by the form and the API route. */
export type QuoteFormValues = {
  name: string;
  email: string;
  phone: string;
  commodity: string;
  weight: string;
  notes: string;
};

type Errors = Partial<Record<keyof QuoteFormValues, string>>;

const initialValues: QuoteFormValues = {
  name: "",
  email: "",
  phone: "",
  commodity: "",
  weight: "",
  notes: "",
};

/** Reject obvious garbage, not legitimate variations. */
function validate(values: QuoteFormValues): Errors {
  const errs: Errors = {};

  if (values.name.trim().length < 2) {
    errs.name = "Enter your name.";
  }

  const email = values.email.trim();
  if (!email) {
    errs.email = "Enter an email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errs.email = "That doesn\u2019t look like a valid email.";
  }

  const phoneDigits = values.phone.replace(/\D/g, "");
  if (!values.phone.trim()) {
    errs.phone = "Enter a phone number.";
  } else if (phoneDigits.length < 10) {
    errs.phone = "Phone number looks too short.";
  }

  if (values.commodity.trim().length < 2) {
    errs.commodity = "What are we hauling?";
  }

  const weight = values.weight.trim();
  if (!weight) {
    errs.weight = "Enter an estimated weight.";
  } else if (!/\d/.test(weight)) {
    errs.weight = "Include a number (e.g. 12000 lbs).";
  }

  return errs;
}

/* ---------- styles: industrial / blocky, no rounded corners ---------- */
const labelCls =
  "block font-mono text-[10px] tracking-[0.22em] text-neutral-400 uppercase";
const requiredMark = (
  <span aria-hidden className="ml-1 text-red-500">
    *
  </span>
);
const baseFieldCls =
  "mt-2.5 block w-full bg-neutral-900 px-4 py-3.5 text-base text-zinc-100 placeholder:text-neutral-600 transition-colors focus:outline-none";
const fieldCls = `${baseFieldCls} border border-neutral-800 focus:border-red-600`;
const errorFieldCls = `${baseFieldCls} border border-red-600 focus:border-red-500`;
const errCls =
  "mt-2 font-mono text-[10px] tracking-[0.14em] text-red-400 uppercase";
const hintCls = "mt-2 font-mono text-[10px] tracking-[0.12em] text-neutral-500 uppercase";

type Status = "idle" | "submitting" | "success";

export function QuoteForm() {
  const [values, setValues] = useState<QuoteFormValues>(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  function update<K extends keyof QuoteFormValues>(
    key: K,
    value: QuoteFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (submitError) setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errs = validate(values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const first = Object.keys(errs)[0];
      if (typeof document !== "undefined") {
        document.getElementById(first)?.focus();
      }
      return;
    }
    setErrors({});
    setSubmitError(null);
    setStatus("submitting");

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(
          data.error ??
            "Could not send your request. Please try again in a moment.",
        );
        setStatus("idle");
        return;
      }
      setStatus("success");
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <SuccessState
        onReset={() => {
          setValues(initialValues);
          setErrors({});
          setSubmitError(null);
          setStatus("idle");
        }}
      />
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={status === "submitting"}
      className="space-y-10"
    >
      {/* 01 / Contact */}
      <Section number="01" title="Contact">
        <Field id="name" label="Name" required error={errors.name}>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            className={errors.name ? errorFieldCls : fieldCls}
            placeholder="Jane Doe"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
        </Field>

        <Field id="email" label="Email" required error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={(e) => update("email", e.target.value)}
            className={errors.email ? errorFieldCls : fieldCls}
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
        </Field>

        <Field id="phone" label="Phone" required error={errors.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            className={errors.phone ? errorFieldCls : fieldCls}
            placeholder="(555) 123-4567"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "phone-error" : undefined}
          />
        </Field>
      </Section>

      {/* 02 / Load */}
      <Section number="02" title="Load">
        <Field id="commodity" label="Commodity" required error={errors.commodity}>
          <input
            id="commodity"
            name="commodity"
            type="text"
            value={values.commodity}
            onChange={(e) => update("commodity", e.target.value)}
            className={errors.commodity ? errorFieldCls : fieldCls}
            placeholder="Skid steer, palletized parts, machinery…"
            aria-invalid={!!errors.commodity}
            aria-describedby={errors.commodity ? "commodity-error" : undefined}
          />
        </Field>

        <Field
          id="weight"
          label="Estimated weight"
          required
          error={errors.weight}
          hint="Include units if you know them — lbs, kg, tons."
        >
          <input
            id="weight"
            name="weight"
            type="text"
            inputMode="decimal"
            value={values.weight}
            onChange={(e) => update("weight", e.target.value)}
            className={errors.weight ? errorFieldCls : fieldCls}
            placeholder="12,000 lbs"
            aria-invalid={!!errors.weight}
            aria-describedby={
              errors.weight ? "weight-error" : "weight-hint"
            }
          />
        </Field>

        <Field id="notes" label="Notes / load details">
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            className={fieldCls}
            placeholder="Pickup/drop locations, dates, equipment needs, anything else dispatch should know."
          />
        </Field>
      </Section>

      {/* Submit row */}
      <div className="space-y-5 border-t border-neutral-800 pt-7">
        <p className="font-mono text-[10px] tracking-[0.2em] text-neutral-500 uppercase">
          Fields marked {requiredMark} are required.
        </p>

        {submitError ? (
          <div
            role="alert"
            className="flex items-start gap-3 border border-red-700 bg-red-950/30 p-4"
          >
            <span
              aria-hidden
              className="mt-0.5 inline-block h-3 w-1 shrink-0 bg-red-600"
            />
            <p className="text-sm leading-relaxed text-red-200">{submitError}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex w-full items-center justify-center bg-red-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {status === "submitting" ? "Sending\u2026" : "Submit to dispatch"}
        </button>
      </div>
    </form>
  );
}

/* ----------------------------- subcomponents ----------------------------- */

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-6 flex items-baseline gap-3">
        <span className="font-mono text-xs text-red-500">
          {number}
        </span>
        <span className="font-mono text-[11px] tracking-[0.22em] text-white uppercase">
          / {title}
        </span>
      </legend>
      <div className="space-y-6">{children}</div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
        {required && requiredMark}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className={errCls}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={hintCls}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function SuccessState({ onReset }: { onReset: () => void }) {
  const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;
  return (
    <div className="border border-neutral-800 bg-neutral-900/40 p-8 sm:p-10">
      <p className="flex items-center gap-3 font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
        <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
        Submitted
      </p>
      <h2 className="mt-4 text-2xl font-display tracking-[-0.01em] text-white sm:text-3xl">
        Request received.
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
        Dispatch will review the details and follow up. For anything
        time-critical, call{" "}
        <a
          href={phoneHref}
          className="text-zinc-100 underline-offset-4 hover:text-white hover:underline"
        >
          {company.dispatchPhone}
        </a>
        .
      </p>
      <div className="mt-7 flex flex-col items-stretch gap-2.5 sm:flex-row sm:gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center border border-neutral-700 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
        >
          Back to home
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center bg-red-600 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500"
        >
          Submit another
        </button>
      </div>
    </div>
  );
}
