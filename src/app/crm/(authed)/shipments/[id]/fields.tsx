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

// Explicit vertical padding + line-height (not a bare fixed h-* with zero
// vertical padding) so short values ("PPE") and long values center
// identically — a tight fixed height with no py left native centering to
// browser/zoom rounding, which visibly offset short text. py+leading+border
// sum to the same ~40px/~26px envelope as before, just symmetric.
const CONTROL_SIZE =
  "h-auto min-h-[40px] px-2.5 py-2 text-[13.5px] leading-tight sm:min-h-[26px] sm:px-2 sm:py-[5px] sm:text-[12.5px] sm:leading-[14px]";

export function TextRow({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  placeholder,
  highlight,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  placeholder?: string;
  highlight?: boolean;
  /** Small helper line under the control — e.g. a live unit conversion.
   * Display-only, never sent anywhere. */
  hint?: ReactNode;
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
      {hint && <span className="text-[10.5px] font-medium text-fg-muted">{hint}</span>}
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

/** Round an "HH:MM" clock value to the nearest :00/:30 mark — the native
 * time input's own step/arrows mostly respect `step={1800}`, but a
 * hand-typed value can still land on any minute, so this is the actual
 * enforcement. 45–59 rolls forward to the next hour's :00. */
function snapToHalfHour(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  let snapped = 0;
  if (minute >= 45) {
    hour = (hour + 1) % 24;
  } else if (minute >= 15) {
    snapped = 30;
  }
  return `${String(hour).padStart(2, "0")}:${String(snapped).padStart(2, "0")}`;
}

/** Pulls up to two "HH:MM" tokens out of whatever free text a window field
 * already holds (old data may read like "8am-10am" with no colon — that
 * doesn't match, and both pickers just start blank; the stored string is
 * left alone until the rep sets it again through the pickers). */
function parseWindow(value: string): { start: string; end: string } {
  const matches = value.match(/\d{1,2}:\d{2}/g) ?? [];
  const normalize = (s: string) => {
    const [h, min] = s.split(":");
    return `${h.padStart(2, "0")}:${min}`;
  };
  return {
    start: matches[0] ? normalize(matches[0]) : "",
    end: matches[1] ? normalize(matches[1]) : "",
  };
}

/** A pickup/delivery "window" (e.g. "08:00 - 10:00") as two real time
 * inputs instead of one freeform text box — each snapped to :00/:30 so the
 * window always reads clean. Combines back into a single "HH:MM - HH:MM"
 * string on change, going through the same onChange/onBlur autosave
 * contract as every other field here. */
export function TimeWindowRow({
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
  const { start, end } = parseWindow(value);

  function setTimes(nextStart: string, nextEnd: string) {
    const parts = [nextStart, nextEnd].filter(Boolean);
    onChange(parts.length === 2 ? `${nextStart} - ${nextEnd}` : parts[0] || "");
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="time"
          step={1800}
          value={start}
          onChange={(e) => setTimes(snapToHalfHour(e.target.value), end)}
          onBlur={onBlur}
          className={`min-w-0 flex-1 ${CONTROL_SIZE} ${CONTROL}`}
        />
        <span className="text-[11px] font-semibold text-fg-muted">to</span>
        <input
          type="time"
          step={1800}
          value={end}
          onChange={(e) => setTimes(start, snapToHalfHour(e.target.value))}
          onBlur={onBlur}
          className={`min-w-0 flex-1 ${CONTROL_SIZE} ${CONTROL}`}
        />
      </div>
    </div>
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
