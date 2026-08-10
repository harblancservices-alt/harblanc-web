"use client";

import type { ReactNode } from "react";

/**
 * Admin-side port of the CRM's `_shell/compactForm.tsx` (D.8 in the mobile
 * audit) — same technique (one responsive `CONTROL_SIZE`, comfortable on
 * mobile / dense on desktop), tuned to admin's OWN current desktop pixel
 * values rather than the CRM's, so swapping an existing hand-rolled admin
 * field (BrokerDetail's `ContactModal` phone/email rows, Maintenance's part
 * rows, Settings' fuel/goal inputs — all currently
 * `px-2.5 py-1.5 text-[13px]`, ~30px tall) over to these primitives is a
 * lossless desktop no-op: the `sm:` tier below reproduces those exact
 * classes. Below `sm` every control grows to a 40px tap target.
 *
 * Parallel file rather than a cross-app import from the CRM's copy —
 * admin's dark-panel/graphite theme uses the same CSS variable NAMES
 * (border-line-strong, bg-card, text-fg, …) as the CRM's `.crm-light` scope
 * but different computed values, and admin's focus treatment
 * (`focus:border-fg`, no ring) differs from the CRM's
 * (`focus:border-accent focus:ring-1`) — see BrokerDetail.tsx's existing
 * inputs.
 */

export const LABEL = "text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle leading-none";

export const CONTROL =
  "rounded-md border border-line-strong bg-card font-medium text-fg placeholder:text-fg-subtle outline-none transition-shadow focus:border-fg";

export const CONTROL_SIZE =
  "h-auto min-h-[40px] px-2.5 py-2 text-[13.5px] leading-tight sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-[13px] sm:leading-normal";

export function FormRow2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>;
}

export function FormRow3({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{children}</div>;
}

export function TextRow({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  className,
  hideLabel,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  /** Extra classes on the wrapper — e.g. a desktop max-width cap. */
  className?: string;
  /** Skip the visible label (still applied as aria-label) — for a field
   * inside a repeating row where the column is identified by position/
   * placeholder instead. */
  hideLabel?: boolean;
  name?: string;
}) {
  return (
    <label className={`flex w-full min-w-0 flex-col gap-1 ${className ?? ""}`}>
      {!hideLabel && <span className={LABEL}>{label}</span>}
      <input
        type={type}
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-label={hideLabel ? label : undefined}
        autoComplete="off"
        className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
      />
    </label>
  );
}

export function MoneyRow({
  label,
  value,
  onChange,
  onBlur,
  className,
  hideLabel,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  className?: string;
  hideLabel?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={`flex w-full min-w-0 flex-col gap-1 ${className ?? ""}`}>
      {!hideLabel && <span className={LABEL}>{label}</span>}
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-fg-subtle sm:left-2 sm:text-[12px]">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-label={hideLabel ? label : undefined}
          className={`w-full min-w-0 pl-6 sm:pl-5 ${CONTROL_SIZE} ${CONTROL}`}
        />
      </div>
    </label>
  );
}

export function SelectRow({
  label,
  value,
  onChange,
  children,
  className,
  hideLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  hideLabel?: boolean;
}) {
  return (
    <label className={`flex w-full min-w-0 flex-col gap-1 ${className ?? ""}`}>
      {!hideLabel && <span className={LABEL}>{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={hideLabel ? label : undefined}
        className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
      >
        {children}
      </select>
    </label>
  );
}

/**
 * Round remove button for a repeating-row editor (broker phones/emails,
 * maintenance part rows) — a comfortable 40px tap target on mobile,
 * shrinking to a small desktop button past `sm`. Replaces the bare "×" text
 * (e.g. BrokerDetail's `RowRemove`, `text-[16px] leading-none` with no
 * padding/hit-area) with an actual tap target below `sm`, while keeping the
 * same visual weight above it.
 */
export function RemoveRowButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bad/30 bg-bad-bg text-bad transition-colors hover:bg-bad/10 disabled:opacity-60 sm:h-6 sm:w-6 sm:border-0 sm:bg-transparent"
    >
      <span className="text-[18px] leading-none sm:text-[15px]">×</span>
    </button>
  );
}
