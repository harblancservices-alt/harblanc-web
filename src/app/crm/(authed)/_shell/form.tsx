import type { ChangeEvent, ReactNode, SelectHTMLAttributes } from "react";
import { CONTROL as BASE_CONTROL, CONTROL_SIZE, LABEL } from "./compactForm";

/**
 * CRM form primitives — the labelled input/select/textarea/toggle used across
 * every CRM dialog and inline editor. Presentational only (no hooks), so they
 * drop into both server and client components. These are the *uncontrolled*
 * (defaultValue, submit-once) counterpart to compactForm.tsx's controlled
 * (value/onChange/onBlur autosave) Row components — both render through the
 * same CONTROL/CONTROL_SIZE/LABEL tokens from compactForm.tsx so every CRM
 * form reads as one compact system (promoted 2026-08-10; previously this
 * file had its own, larger 44px tokens).
 */

export { LABEL, CONTROL_SIZE };

// Backward-compat bundled token for call sites that combine CONTROL with
// their own one-off height class (list search bars, inline comboboxes)
// instead of going through Field/SelectField. Same border/radius/focus as
// the shared standard, with compact (non-responsive) padding/text baked in
// since these callers don't opt into the mobile/desktop CONTROL_SIZE split.
export const CONTROL = `${BASE_CONTROL} px-2.5 text-[13px]`;

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
    <label className="flex w-full min-w-0 flex-col gap-1">
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
        className={`w-full min-w-0 ${CONTROL_SIZE} ${BASE_CONTROL}`}
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
    <label className="flex w-full min-w-0 flex-col gap-1">
      <FieldLabel required={required}>{label}</FieldLabel>
      <textarea
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        rows={rows}
        autoFocus={autoFocus}
        className={`w-full min-w-0 resize-y py-1.5 leading-snug sm:py-1 ${BASE_CONTROL} text-[13.5px] sm:text-[12.5px]`}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  required,
  disabled,
  onChange,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  /** Optional — for the rare field whose selection drives another field
   * client-side (e.g. a dependent contact list filtered by company). Most
   * callers don't need this; the value still submits normally either way. */
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1">
      <FieldLabel required={required}>{label}</FieldLabel>
      <SelectChrome>
        <select
          name={name}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          onChange={onChange}
          className={`w-full min-w-0 disabled:opacity-60 ${CONTROL_SIZE} ${SELECT_CONTROL}`}
        >
          {children}
        </select>
      </SelectChrome>
    </label>
  );
}

/**
 * SELECT CHROME — one caret for every dropdown in the CRM.
 *
 * A bare <select> renders with the operating system's own arrow and menu
 * button, which on Windows is a grey square that matches nothing else on
 * the page. The audit counted eight of them on agent-facing screens alone:
 * four filters on Companies, one on Contacts, the "Move" control under
 * every Pipeline and Tasks card, and two inside the contact dialog.
 *
 * The element stays NATIVE on purpose. A hand-rolled listbox would have to
 * re-implement keyboard navigation, type-ahead, form association and the
 * mobile wheel picker, and would get one of them wrong. `appearance-none`
 * only removes the OS's own decoration; everything that makes a select work
 * is untouched.
 *
 * The caret is aria-hidden and pointer-events-none so it is invisible to
 * assistive tech and cannot swallow the click that opens the menu.
 */
export const SELECT_CONTROL = `${BASE_CONTROL} appearance-none pr-8`;

export function SelectChrome({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`relative block ${className ?? ""}`}>
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[8px] text-fg-subtle"
      >
        ▼
      </span>
    </span>
  );
}

/**
 * A native <select> already wearing the CRM's chrome.
 *
 * `wrapClassName` carries the LAYOUT (flex-1, min-w-0, width) because the
 * caret is positioned against the wrapper — putting flex classes on the
 * select itself would size the box and leave the arrow floating somewhere
 * else. `className` carries anything else the select needs.
 */
export function StyledSelect({
  className,
  wrapClassName,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapClassName?: string }) {
  return (
    <SelectChrome className={wrapClassName}>
      <select className={`w-full ${SELECT_CONTROL} ${className ?? ""}`} {...props}>
        {children}
      </select>
    </SelectChrome>
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
    <label className="flex items-start gap-2.5 rounded-[5px] border border-fg-subtle bg-card px-2.5 py-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[11.5px] text-fg-subtle">{hint}</span>
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
      className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60 max-lg:h-11 max-lg:text-[14px]"
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
      className="mb-3 rounded-[5px] border border-bad/30 bg-bad-bg px-3 py-2 text-[13px] text-bad"
    >
      {message}
    </div>
  );
}
