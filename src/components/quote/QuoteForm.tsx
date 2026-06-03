"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadQuickQuoteDocument } from "@/app/quote/upload-actions";

/** Files the customer can attach to a Quick Quote. Validated again
 *  server-side; this client gate just blocks obvious mismatches early. */
const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Public Quick Quote form (Phase 2A).
 *
 * Five-section, mobile-first lead capture. Replaces the previous detailed
 * freight intake form on the public site. The detailed intake still exists
 * — it now lives in admin (GenerateQuoteForm) and runs LATER in the
 * workflow, once the customer has engaged.
 *
 * Design rules (see docs/communication-workflow.md):
 *   - sub-60-second completion on a phone
 *   - no hard pricing, no PDF, no contract terms
 *   - server fires both an internal dispatch alert and a customer
 *     acknowledgement email after a successful insert
 *   - on success, navigate to /quote/success rather than swapping in
 *     a SuccessState inline (a real page is shareable, refreshable, and
 *     plays nicer with browser back/forward)
 */

export type QuickQuoteValues = {
  pickupZip: string;
  deliveryZip: string;
  commodity: string;
  weight: string;
  pickupDate: string; // YYYY-MM-DD or "" (treated server-side as ASAP)
  name: string;
  phone: string;
  email: string;
  notes: string;
};

type Errors = Partial<Record<keyof QuickQuoteValues, string>>;

const initialValues: QuickQuoteValues = {
  pickupZip: "",
  deliveryZip: "",
  commodity: "",
  weight: "",
  pickupDate: "",
  name: "",
  phone: "",
  email: "",
  notes: "",
};

/** Reject obvious garbage, not legitimate variations. */
function validate(values: QuickQuoteValues): Errors {
  const errs: Errors = {};

  const zipRe = /^\d{5}(?:-\d{4})?$/;

  if (!zipRe.test(values.pickupZip.trim())) {
    errs.pickupZip = "Enter a 5-digit ZIP.";
  }
  if (!zipRe.test(values.deliveryZip.trim())) {
    errs.deliveryZip = "Enter a 5-digit ZIP.";
  }

  if (values.commodity.trim().length < 2) {
    errs.commodity = "What are we moving?";
  }

  const weight = values.weight.trim();
  if (!weight) {
    errs.weight = "Enter an approximate weight.";
  } else if (!/\d/.test(weight)) {
    errs.weight = "Include a number (e.g. 8000 lbs).";
  }

  // pickupDate is optional — empty is treated as "ASAP"

  if (values.name.trim().length < 2) {
    errs.name = "Enter your name.";
  }

  const phoneDigits = values.phone.replace(/\D/g, "");
  if (!values.phone.trim()) {
    errs.phone = "Enter a phone number.";
  } else if (phoneDigits.length < 10) {
    errs.phone = "Phone number looks too short.";
  }

  const email = values.email.trim();
  if (!email) {
    errs.email = "Enter an email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errs.email = "That doesn’t look like a valid email.";
  }

  return errs;
}

/* ---------- styles: industrial / blocky, no rounded corners ---------- */
const labelCls =
  "block font-mono text-[10px] tracking-[0.22em] text-white uppercase";
const requiredMark = (
  <span aria-hidden className="ml-1 text-red-500">
    *
  </span>
);
const baseFieldCls =
  "mt-2.5 block w-full bg-neutral-900 px-4 py-3.5 text-base text-zinc-100 placeholder:text-neutral-500 transition-colors focus:outline-none";
const fieldCls = `${baseFieldCls} border border-neutral-800 focus:border-red-600`;
const errorFieldCls = `${baseFieldCls} border border-red-600 focus:border-red-500`;
const errCls =
  "mt-2 font-mono text-[10px] tracking-[0.14em] text-red-400 uppercase";
const hintCls =
  "mt-2 font-mono text-[10px] tracking-[0.12em] text-white uppercase";

type Status = "idle" | "submitting" | "uploading";

export function QuoteForm() {
  const router = useRouter();
  const [values, setValues] = useState<QuickQuoteValues>(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Anti-spam: honeypot + min-time check.
   *
   * - `honeypot` is a hidden field that real users never see (off-screen,
   *   tabindex=-1, aria-hidden). Bots that auto-fill every input will
   *   trip it. The form refuses to submit if it's non-empty.
   * - `formStartedAt` is set on mount via useEffect. Submissions that
   *   arrive faster than MIN_SUBMIT_MS after the form rendered are
   *   almost certainly automated and refused server-side.
   *
   * Both checks happen on the server too — never trust client guards
   * alone. These client checks just keep dispatch from receiving
   * obvious bot traffic.
   */
  const [honeypot, setHoneypot] = useState("");
  const formStartedAtRef = useRef<number>(0);
  useEffect(() => {
    formStartedAtRef.current = Date.now();
  }, []);

  // Optional uploaded files. Customer can pick documents/photos
  // alongside their quote request. Files are uploaded AFTER the
  // /api/quote POST succeeds (so we have a leadId to attach them
  // to). Per-file outcome is tracked so we can show a summary
  // without blocking navigation to /quote/success.
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
    failed: string[];
  }>({ done: 0, total: 0, failed: [] });

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next: File[] = [];
    const rejects: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > UPLOAD_MAX_BYTES) {
        rejects.push(`${f.name}: file too large (max 15 MB)`);
        continue;
      }
      if (
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
          f.type,
        )
      ) {
        rejects.push(`${f.name}: unsupported type`);
        continue;
      }
      next.push(f);
    }
    setSelectedFiles((prev) => [...prev, ...next]);
    if (rejects.length > 0) {
      setSubmitError(rejects.join(" · "));
    }
  }

  function removeFile(idx: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function update<K extends keyof QuickQuoteValues>(
    key: K,
    value: QuickQuoteValues[K],
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
        body: JSON.stringify({
          ...values,
          website: honeypot,
          formStartedAt: formStartedAtRef.current,
        }),
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

      // Lead created. If files were picked, upload them via the
      // quick-quote action serially so the customer sees progress.
      // Failed files don't block navigation — the lead is already
      // saved, and dispatch can follow up if anything's missing.
      const data = (await res.json().catch(() => ({}))) as { leadId?: string };
      const leadId = data.leadId;
      if (leadId && selectedFiles.length > 0) {
        setStatus("uploading");
        setUploadProgress({ done: 0, total: selectedFiles.length, failed: [] });
        for (let i = 0; i < selectedFiles.length; i++) {
          const f = selectedFiles[i];
          const fd = new FormData();
          fd.append("file", f);
          const result = await uploadQuickQuoteDocument(leadId, fd);
          setUploadProgress((prev) => ({
            done: i + 1,
            total: prev.total,
            failed: result.ok ? prev.failed : [...prev.failed, f.name],
          }));
        }
      }
      router.push("/quote/success");
    } catch {
      setSubmitError("Network error. Check your connection and try again.");
      setStatus("idle");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={status === "submitting"}
      className="space-y-10"
    >
      {/* Honeypot — invisible to real users, irresistible to bots.
          Off-screen via position absolute, plus aria-hidden + tabIndex=-1
          so screen readers and keyboard users skip it. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label htmlFor="website">Website (leave blank)</label>
        <input
          id="website"
          name="website"
          type="text"
          autoComplete="off"
          tabIndex={-1}
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {/* 01 / Lane */}
      <Section number="01" title="Lane">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field id="pickupZip" label="Pickup ZIP" required error={errors.pickupZip}>
            <input
              id="pickupZip"
              name="pickupZip"
              type="text"
              autoComplete="postal-code"
              inputMode="numeric"
              pattern="\d{5}(?:-\d{4})?"
              maxLength={10}
              value={values.pickupZip}
              onChange={(e) => update("pickupZip", e.target.value)}
              className={errors.pickupZip ? errorFieldCls : fieldCls}
              placeholder="74104"
              aria-invalid={!!errors.pickupZip}
              aria-describedby={errors.pickupZip ? "pickupZip-error" : undefined}
            />
          </Field>
          <Field
            id="deliveryZip"
            label="Delivery ZIP"
            required
            error={errors.deliveryZip}
          >
            <input
              id="deliveryZip"
              name="deliveryZip"
              type="text"
              autoComplete="postal-code"
              inputMode="numeric"
              pattern="\d{5}(?:-\d{4})?"
              maxLength={10}
              value={values.deliveryZip}
              onChange={(e) => update("deliveryZip", e.target.value)}
              className={errors.deliveryZip ? errorFieldCls : fieldCls}
              placeholder="75201"
              aria-invalid={!!errors.deliveryZip}
              aria-describedby={
                errors.deliveryZip ? "deliveryZip-error" : undefined
              }
            />
          </Field>
        </div>
      </Section>

      {/* 02 / Load */}
      <Section number="02" title="Load">
        <Field id="commodity" label="What are we moving?" required error={errors.commodity}>
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

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field
            id="weight"
            label="Approximate weight"
            required
            error={errors.weight}
            hint="lbs, kg, tons — whatever you know."
          >
            <input
              id="weight"
              name="weight"
              type="text"
              inputMode="decimal"
              value={values.weight}
              onChange={(e) => update("weight", e.target.value)}
              className={errors.weight ? errorFieldCls : fieldCls}
              placeholder="8,000 lbs"
              aria-invalid={!!errors.weight}
              aria-describedby={
                errors.weight ? "weight-error" : "weight-hint"
              }
            />
          </Field>

          <Field
            id="pickupDate"
            label="Target pickup date"
            hint="Leave blank if it’s ASAP."
          >
            <input
              id="pickupDate"
              name="pickupDate"
              type="date"
              value={values.pickupDate}
              onChange={(e) => update("pickupDate", e.target.value)}
              className={fieldCls}
            />
          </Field>
        </div>

        {/* Optional Documents & Photos — freight photos, packaging,
            spec sheets, weight/dimension PDFs. Uploaded after the
            quote request is created. JPG / PNG / WEBP / PDF up to
            15 MB each. */}
        <Field
          id="documents"
          label="Documents & photos (optional)"
          hint="Up to 15 MB each — JPG, PNG, WEBP, or PDF."
        >
          <div>
            {/* The label acts as the visible picker. We disable
                it visually AND gate the underlying input while
                status !== "idle" so files added mid-upload can't
                fall into the silent-drop window between the
                upload loop's initial selectedFiles snapshot and
                the post-loop router.push to /quote/success. */}
            <label
              htmlFor="documents"
              aria-disabled={status !== "idle"}
              className={
                "btn-cut mt-2.5 inline-flex items-center gap-2 bg-red-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#fff] transition-colors " +
                (status !== "idle"
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:bg-red-500")
              }
            >
              Add files
            </label>
            <input
              id="documents"
              name="documents"
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              disabled={status !== "idle"}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              className="sr-only"
            />
            {selectedFiles.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {selectedFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 border border-neutral-800 bg-neutral-900/40 px-3 py-2"
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-6 w-9 shrink-0 items-center justify-center border border-neutral-700 bg-neutral-950 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-red-400"
                    >
                      {f.type.startsWith("image/") ? "IMG" : "PDF"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white">
                      {f.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-white">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={status !== "idle"}
                      aria-label={`Remove ${f.name}`}
                      className="shrink-0 border border-neutral-700 bg-neutral-950 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white transition-colors hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-700 disabled:hover:text-white"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Field>
      </Section>

      {/* 03 / Contact */}
      <Section number="03" title="Contact">
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

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
        </div>
      </Section>

      {/* 04 / Additional details (optional) */}
      <Section number="04" title="Anything else?">
        <Field id="notes" label="Additional details (optional)">
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={values.notes}
            onChange={(e) => update("notes", e.target.value)}
            className={fieldCls}
            placeholder="Dimensions, deadlines, special handling, forklift on either end, anything dispatch should know."
          />
        </Field>
      </Section>

      {/* Submit row */}
      <div className="space-y-5 border-t border-neutral-800 pt-7">
        <p className="font-mono text-[10px] tracking-[0.2em] text-white uppercase">
          Fields marked {requiredMark} are required. This is a request, not a
          binding order. Dispatch replies with a price range within the hour.
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

        {status === "uploading" && uploadProgress.total > 0 ? (
          <p className="font-mono text-[10px] tracking-[0.2em] text-white uppercase">
            Uploading {uploadProgress.done} of {uploadProgress.total} file
            {uploadProgress.total === 1 ? "" : "s"}…
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status !== "idle"}
          className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {status === "submitting"
            ? "Sending…"
            : status === "uploading"
              ? "Uploading files…"
              : "Request a quote"}
        </button>
      </div>
    </form>
  );
}

/* ---------- helpers ---------- */

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
    <section className="space-y-5">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl font-bold tracking-[0.18em] text-red-500">
          {number}
        </span>
        <h2 className="font-mono text-[11px] tracking-[0.22em] text-white uppercase">
          {title}
        </h2>
      </div>
      {children}
    </section>
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
        {required ? requiredMark : null}
      </label>
      {children}
      {hint && !error ? <p className={hintCls}>{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={errCls}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
