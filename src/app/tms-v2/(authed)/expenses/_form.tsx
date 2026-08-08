"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Small form primitives colocated under expenses/ — see loads/_form.tsx's
 * header for why these are duplicated rather than shared: this phase's
 * concurrency scope is loads/**, expenses/**, actions files, and the
 * mutation helper only, so a cross-entity shared form-kit addition is out
 * of scope. Same high-contrast label/control pattern as the CRM's form
 * standard (project memory: "CRM high-contrast form standard").
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

export function TextareaField({
  label,
  name,
  className = "",
  ...props
}: { label: string; className?: string } & import("react").TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
      <span>{label}</span>
      <textarea
        name={name}
        className={`rounded-md border border-line-strong bg-card px-2.5 py-2 text-[14px] font-normal text-fg focus:border-fg focus:outline-none ${className}`}
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
