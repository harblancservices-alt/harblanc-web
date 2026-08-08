"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { formatPhone, formatPhoneInput } from "@/lib/domain/phone";

/**
 * Small form primitives colocated under loads/ (not components/tms-v2/ui —
 * see the phase brief's concurrency note: this phase touches only
 * loads/**, expenses/**, actions files, and the mutation helper, so a
 * shared UI-kit addition is out of scope here). Same high-contrast label/
 * control pattern as the CRM's form standard (project memory: "CRM
 * high-contrast form standard") — no faint grey labels.
 */

export function Field({
  label,
  name,
  required,
  className = "",
  ...props
}: { label: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
      {/* Label text + the required asterisk must share ONE flex item — as
          two separate children of this flex-col label they each became
          their own row (an empty-looking centered "*" line under every
          required label). Wrapping them in a single <span> keeps them on
          one line, "Label *". */}
      <span>
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </span>
      <input
        name={name}
        required={required}
        className={`h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] font-normal text-fg focus:border-fg focus:outline-none ${className}`}
        {...props}
      />
    </label>
  );
}

/** A phone <input> that auto-formats to "(XXX) XXX-XXXX" as the user types
 * (lib/domain/phone.ts's formatPhoneInput) — the one shared phone field
 * every tms-v2 form using this file's `Field` primitive should use instead
 * of a bare `<Field type="tel">`. Manages its own controlled state
 * internally so callers keep the same drop-in shape (`defaultValue`, not
 * `value`/`onChange`) every other uncontrolled Field call site already has. */
export function PhoneField({
  label,
  name,
  required,
  defaultValue,
  className = "",
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string | null;
  className?: string;
}) {
  const [value, setValue] = useState(() => formatPhone(defaultValue ?? "") || (defaultValue ?? ""));
  return (
    <Field
      label={label}
      name={name}
      type="tel"
      required={required}
      value={value}
      onChange={(e) => setValue(formatPhoneInput(e.target.value))}
      autoComplete="off"
      className={className}
    />
  );
}

export function SelectField({
  label,
  name,
  required,
  children,
  className = "",
  ...props
}: { label: string; className?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
      <span>
        {label}
        {required ? <span className="text-bad"> *</span> : null}
      </span>
      <select
        name={name}
        required={required}
        className={`h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] font-normal text-fg focus:border-fg focus:outline-none ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-[13px] font-medium text-bad">
      {message}
    </p>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex items-center justify-end gap-2">{children}</div>;
}
