"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

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
      {label}
      {required ? <span className="text-bad"> *</span> : null}
      <input
        name={name}
        required={required}
        className={`h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] font-normal text-fg focus:border-fg focus:outline-none ${className}`}
        {...props}
      />
    </label>
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
      {label}
      {required ? <span className="text-bad"> *</span> : null}
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
