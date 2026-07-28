import type { ChangeEvent, ReactNode } from "react";

/**
 * CRM form primitives — the labelled input/select/textarea/toggle used across
 * every CRM dialog and inline editor. Presentational only (no hooks), so they
 * drop into both server and client components. Styling matches the shell's
 * premium .crm-light chrome: uppercase micro-labels over an 11px-tracked
 * caption, 44px controls with the accent focus ring.
 */

const CONTROL =
  "rounded-lg border border-line-strong bg-card px-3 text-[14px] text-fg outline-none transition-shadow focus:ring-2 focus:ring-accent/40";

const LABEL =
  "text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-subtle";

export function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span className={LABEL}>
      {children}
      {required && <span className="ml-1 text-accent">*</span>}
    </span>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  autoFocus,
  placeholder,
  defaultValue,
  inputMode,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  defaultValue?: string | number | null;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url";
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        name={name}
        type={type}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        inputMode={inputMode}
        step={step}
        className={`h-11 ${CONTROL}`}
      />
    </label>
  );
}

export function TextareaField({
  label,
  name,
  required,
  placeholder,
  defaultValue,
  rows = 3,
  autoFocus,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | null;
  rows?: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        rows={rows}
        autoFocus={autoFocus}
        className={`resize-y py-2.5 leading-relaxed ${CONTROL}`}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  required,
  onChange,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  /** Optional — for the rare field whose selection drives another field
   * client-side (e.g. a dependent contact list filtered by company). Most
   * callers don't need this; the value still submits normally either way. */
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        onChange={onChange}
        className={`h-11 ${CONTROL}`}
      >
        {children}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-line-strong bg-card px-3 py-2.5">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-fg">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[12px] text-fg-subtle">{hint}</span>
        )}
      </span>
    </label>
  );
}

/** Primary submit button, consistent across every CRM form. */
export function SubmitButton({
  pending,
  children,
  pendingLabel = "Saving…",
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-accent text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Inline error banner shared by dialogs. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-3 rounded-lg border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad"
    >
      {message}
    </div>
  );
}
