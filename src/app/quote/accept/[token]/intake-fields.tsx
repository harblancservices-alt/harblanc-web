"use client";

import { useState } from "react";

/**
 * UX-improvement field helpers for the customer intake form.
 *
 * Kept in a sibling module so IntakeForm.tsx stays focused on the form
 * shape. Each helper is a small controlled component that wraps the
 * native input it replaces — submission still goes through the same
 * native form, the same FormData names, and the same server actions.
 *
 *   PhoneField                 → progressive (XXX) XXX-XXXX formatting
 *   StateSelect                → 50 states + DC, "XX — Name" label, "XX" value
 *   DateWindowField            → two paired date inputs, end>=start enforced
 *   AppointmentStatusSelect    → fixed 4-option scheduling-posture select
 *
 * Styling matches the IntakeForm palette — inputs on the lightest depth
 * layer (#2e2e2e bg, #3a3a3a border) so they read consistently with the
 * surrounding cards.
 */

// Shared styling — kept in sync with IntakeForm's inputCls / labelCls.
const inputCls =
  // Matches IntakeForm.inputCls. Focus is the deeper red-600 (brand
  // strip color) with transition-colors so the border eases in.
  "block w-full border border-[#3a3a3a] bg-[#2e2e2e] px-3 py-3 text-base text-white placeholder:text-neutral-500 transition-colors focus:border-red-600 focus:outline-none";
const labelCls =
  "block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300";
const subLabelCls =
  "block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400";

// ─── Phone formatting ────────────────────────────────────────────────────

/**
 * Progressive US phone formatter. Strips non-digits, caps at 10 digits,
 * and formats the partial value as the customer types:
 *
 *   ""          → ""
 *   "303"       → "(303"
 *   "3035"      → "(303) 5"
 *   "303555"    → "(303) 555"
 *   "3035550144" → "(303) 555-0144"
 *
 * Accepts pasted values in any format (e.g. "303-555-0144", "+1 303 555 0144"),
 * normalizes to the 10-digit US format. Anything beyond 10 digits is
 * silently dropped — out of scope for this carrier's customer base.
 */
export function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function PhoneField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  // Controlled — the formatted value IS what's stored in state and
  // submitted via the form. The server stores it as text; no schema
  // coupling to format.
  const [value, setValue] = useState<string>(() =>
    formatPhoneDisplay(defaultValue ?? ""),
  );

  return (
    <div>
      <label className={labelCls} htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => setValue(formatPhoneDisplay(e.target.value))}
        placeholder="(303) 555-0144"
        maxLength={14}
        className={`mt-2 ${inputCls}`}
      />
    </div>
  );
}

// ─── US state select ─────────────────────────────────────────────────────

/**
 * USPS two-letter abbreviation + full state name. The select displays
 * "TX — Texas" so the customer can recognize their state at a glance
 * but the stored / submitted value is the two-letter code.
 *
 * DC included because freight runs there constantly. Territories not
 * included — out of scope for this carrier's lane geography.
 */
export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export function StateSelect({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  // Normalize whatever the existing intake row has into a two-letter
  // code so the select stays useful even if a legacy row stored a
  // freeform value. Anything that doesn't match a known code falls
  // through to "" (Select…), preserving the customer's option to
  // correct it.
  const normalized = (() => {
    const raw = (defaultValue ?? "").trim().toUpperCase();
    if (raw.length === 0) return "";
    if (US_STATES.some((s) => s.code === raw)) return raw;
    // Last-ditch: maybe the legacy row has a full state name. Try matching.
    const byName = US_STATES.find(
      (s) => s.name.toUpperCase() === raw,
    );
    return byName ? byName.code : "";
  })();

  return (
    <div>
      <label className={labelCls} htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={normalized}
        className={`mt-2 ${inputCls}`}
      >
        <option value="">Select…</option>
        {US_STATES.map((s) => (
          // Display the two-letter code only — operators and customers
          // both recognize it at a glance, and the abbreviated form fits
          // cleanly into the narrow State column of the City/State/ZIP
          // grid on mobile. Full state names remain in the US_STATES
          // list for accessibility (the option label still reads as a
          // recognizable freight-paperwork abbreviation).
          <option key={s.code} value={s.code} aria-label={s.name}>
            {s.code}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Paired date window ─────────────────────────────────────────────────

/**
 * Two native date inputs side by side — "Start" and "End". End is
 * client-side validated to be >= Start. Both submit independently
 * under the two given field names so the server action can persist
 * them directly into the new pickup_window_start/end or
 * delivery_window_start/end columns.
 *
 * No time fields by design — real dispatch confirms exact times by
 * phone after intake (see AppointmentStatusSelect below).
 */
export function DateWindowField({
  label,
  startName,
  endName,
  startDefault,
  endDefault,
}: {
  label: string;
  startName: string;
  endName: string;
  startDefault?: string;
  endDefault?: string;
}) {
  const [start, setStart] = useState<string>(startDefault ?? "");
  const [end, setEnd] = useState<string>(endDefault ?? "");

  // Use the input's `min` attribute to forbid end-before-start at the
  // browser level. Belt-and-suspenders: clear an end that becomes
  // invalid when the customer changes the start.
  function onStartChange(next: string) {
    setStart(next);
    if (end && next && end < next) setEnd("");
  }

  const isOutOfOrder = !!start && !!end && end < start;

  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={subLabelCls} htmlFor={startName}>
            Start
          </label>
          <input
            id={startName}
            name={startName}
            type="date"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          />
        </div>
        <div>
          <label className={subLabelCls} htmlFor={endName}>
            End (optional)
          </label>
          <input
            id={endName}
            name={endName}
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          />
        </div>
      </div>
      {isOutOfOrder ? (
        <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-red-400">
          End date can&rsquo;t be before the start date.
        </p>
      ) : null}
    </div>
  );
}

// ─── Appointment status ─────────────────────────────────────────────────

/**
 * Four-option scheduling posture select. Captures the customer's
 * relationship with timing without asking for exact times — dispatch
 * confirms those by phone after intake/payment.
 *
 * Stored values are stable codes (snake_case). The customer-facing
 * labels are human-readable.
 */
export const APPOINTMENT_STATUS_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "", label: "Select…" },
  { value: "flexible", label: "Flexible" },
  { value: "appointment_needed", label: "Appointment needed" },
  { value: "already_scheduled", label: "Already scheduled" },
  { value: "call_to_schedule", label: "Call me to schedule" },
];

export function AppointmentStatusSelect({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className={`mt-2 ${inputCls}`}
      >
        {APPOINTMENT_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
