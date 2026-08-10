"use client";

import type { ReactNode } from "react";

/**
 * Controlled field primitives for the shipment workspace and the RC/BOL
 * document editors — every value is autosaved on blur (see the various
 * commit() functions in ShipmentWorkspace/RateConfirmationEditor/BolEditor),
 * so these need onChange (keystroke-level, local state only) AND onBlur
 * (fires the actual server write) rather than form.tsx's uncontrolled
 * defaultValue inputs built for submit-once dialogs.
 *
 * Compact form standard (2026-08-09, Brent's call): dense on desktop — tiny
 * uppercase labels, thin 1px borders, ~26px controls, tight vertical gaps —
 * but every control stays a comfortable tap target below the `sm` breakpoint
 * since these three forms get used from a phone in the field. Deliberately
 * its own CONTROL/LABEL tokens rather than _shell/form's — that file backs
 * every dialog sitewide, so keeping these local scopes the compaction to
 * exactly these three files.
 *
 * `highlight` marks a field that still holds its untouched value from a
 * customer/location/carrier pick — the same "auto-filled" affordance across
 * every picker in these editors.
 */

const LABEL = "text-[9.5px] font-bold uppercase tracking-[0.07em] text-fg leading-none";

const CONTROL =
  "rounded-[5px] border border-fg-subtle bg-card font-medium text-fg outline-none transition-shadow focus:border-accent focus:ring-1 focus:ring-accent/50";

const CONTROL_SIZE = "h-10 px-2.5 text-[13.5px] sm:h-[26px] sm:px-2 sm:text-[12.5px]";

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
    <label className="flex w-full min-w-0 flex-col gap-1">
      <span className={LABEL}>
        {label}
        {highlight && (
          <span className="ml-1.5 text-[8.5px] font-semibold normal-case tracking-normal text-ok">
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
        className={`w-full min-w-0 ${CONTROL_SIZE} ${highlight ? "border-ok ring-1 ring-ok/30" : ""} ${CONTROL}`}
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
    <label className="flex w-full min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        className={`w-full min-w-0 resize-y py-1.5 leading-snug sm:py-1 ${CONTROL} text-[13.5px] sm:text-[12.5px]`}
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
    <label className="flex w-full min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-fg-subtle sm:left-2 sm:text-[12px]">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
      >
        {children}
      </select>
    </label>
  );
}

export function FormRow2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>;
}

export function FormRow3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{children}</div>;
}

/**
 * A small bold label + thin light-gray hairline — the quiet replacement for
 * CardHead's heavy `bg-bar` band inside the RC/BOL/shipment editors. Kept
 * local to these three files rather than added to _shell/ui.tsx, since
 * CardHead's dark band is the deliberate standard everywhere else in the CRM.
 */
export function SectionDivider({
  label,
  hint,
  right,
}: {
  label: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 pb-2 pt-3">
      <div className="min-w-0">
        <h2 className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-fg">{label}</h2>
        {hint && <p className="truncate text-[10.5px] text-fg-subtle">{hint}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/**
 * The compact "selected entity" readout for a prefill picker (customer,
 * carrier, shipper/consignee location) — a one-line summary plus a Change
 * (reopen the picker to swap) and Reset (detach + blank the filled fields)
 * control, so swapping or clearing what a picker filled is always one tap.
 */
export function SelectedEntityChip({
  title,
  detail,
  onChange,
  onReset,
}: {
  title: string;
  detail?: string | null;
  onChange?: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[5px] border border-ok/40 bg-ok-bg px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-semibold text-fg">{title}</p>
        {detail && <p className="truncate text-[10.5px] text-fg-muted">{detail}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="rounded-[3px] bg-[#2563eb] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#1d4ed8]"
          >
            Change
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="rounded-[3px] bg-[#2563eb] px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#1d4ed8]"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
