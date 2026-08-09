"use client";

import { CONTROL, LABEL } from "../../_shell/form";

/**
 * Controlled field primitives for the shipment workspace — every value is
 * autosaved on blur (see useShipmentEditor in ShipmentWorkspace.tsx), so
 * these need onChange (keystroke-level, local state only) AND onBlur
 * (fires the actual server write) rather than form.tsx's uncontrolled
 * defaultValue inputs built for submit-once dialogs. `highlight` marks a
 * field that still holds its untouched value from a customer/location pick
 * — same "auto-filled" affordance as the BOL generator's TextInput.
 */

export function TextRow({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  placeholder?: string;
  highlight?: boolean;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1.5">
      <span className={LABEL}>
        {label}
        {highlight && (
          <span className="ml-1.5 text-[10px] font-semibold normal-case tracking-normal text-ok">
            auto-filled
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`h-11 w-full min-w-0 ${highlight ? "border-ok ring-1 ring-ok/30" : ""} ${CONTROL}`}
      />
    </label>
  );
}

export function TextAreaRow({
  label,
  value,
  onChange,
  onBlur,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        className={`w-full min-w-0 resize-y py-2.5 leading-relaxed ${CONTROL}`}
      />
    </label>
  );
}

export function MoneyRow({
  label,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-fg-subtle">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={`h-11 w-full min-w-0 pl-6 ${CONTROL}`}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1.5">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full min-w-0 ${CONTROL}`}
      >
        {children}
      </select>
    </label>
  );
}

export function FormRow2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
