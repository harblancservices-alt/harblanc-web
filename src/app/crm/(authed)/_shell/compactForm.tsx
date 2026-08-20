"use client";

import type { ReactNode } from "react";
import { IconPlus, IconX } from "./icons";
import { BTN_DANGER, BTN_EDIT } from "./ui";

/**
 * CRM-wide compact form primitives — the visual language originally built
 * for the shipment/RC/BOL editors (2026-08-09, Brent's call) and promoted
 * sitewide (2026-08-10). Dense on desktop — tiny uppercase labels, thin 1px
 * borders, ~26px controls, tight vertical gaps — but every control stays a
 * comfortable tap target below the `sm` breakpoint.
 *
 * Two APIs consume the same CONTROL/LABEL/CONTROL_SIZE tokens so the whole
 * CRM reads as one system:
 *   - controlled (value/onChange/onBlur autosave) — the Row components
 *     below, used by the shipment workspace and RC/BOL editors.
 *   - uncontrolled (defaultValue, submit-once) — _shell/form.tsx's
 *     Field/SelectField/TextareaField, used by every create/edit dialog.
 * Only the value-binding contract differs; the rendered chrome is identical.
 */

export const LABEL = "text-[9.5px] font-bold uppercase tracking-[0.07em] text-fg leading-none";

// 2026-08-20: sunken bg-inset fill (was bg-card, identical to its parent
// Card's own background — the exact "white-on-white, no fill to signal
// 'editable'" flatness crm-design.css's own docs call out fixing). A field
// now visibly reads as editable against both the page canvas and the white
// card it sits inside, and "lifts" to bg-card on focus, matching
// /crm-design's INPUT token exactly.
export const CONTROL =
  "rounded-[5px] border border-line-strong bg-inset font-medium text-fg outline-none transition-colors focus:border-accent focus:bg-card focus:ring-1 focus:ring-accent/50";

// Explicit vertical padding + line-height (not a bare fixed h-* with zero
// vertical padding) so short values ("PPE") and long values center
// identically — a tight fixed height with no py left native centering to
// browser/zoom rounding, which visibly offset short text. See
// crm-field-compactness-audit.md section E.
export const CONTROL_SIZE =
  "h-auto min-h-[40px] px-2.5 py-2 text-[13.5px] leading-tight sm:min-h-[26px] sm:px-2 sm:py-[5px] sm:text-[12.5px] sm:leading-[14px]";

/** Common narrow field widths for data that's never long (state, ZIP,
 * MC#/DOT#, a money column). Desktop-only — below `sm` these fields still
 * take the full row width, matching the mobile-untouched rule everywhere
 * else in this pass. Apply via a Row's `className` prop. */
export const NARROW = {
  state: "sm:max-w-[4.5rem]",
  short: "sm:max-w-[6.5rem]", // ZIP, MC#, DOT#, duration
  money: "sm:max-w-[8rem]",
} as const;

/**
 * Shared tappable-pill tokens for MultiSelectChips (Equipment needed,
 * Special requirements) and TagsCard (account tags) — both already used the
 * same tap-to-select-green/tap-again-to-deselect interaction by convention,
 * just without a shared token, so the two pickers could silently drift.
 * PILL_SIZE is responsive (40px mobile / 28px desktop) instead of the old
 * flat 44px, matching CONTROL_SIZE's own split.
 */
export const PILL = "flex items-center whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold transition-colors";
export const PILL_SIZE = "min-h-10 sm:min-h-7";
export const PILL_ACTIVE = "border border-ok bg-ok text-white hover:bg-ok/90";
export const PILL_INACTIVE = "border border-fg-subtle bg-card text-fg hover:bg-inset";
export const PILL_DASHED =
  "border border-dashed border-fg-subtle bg-card text-fg-muted hover:border-accent/50 hover:text-accent";

export function FormRow2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>;
}

export function FormRow3({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{children}</div>;
}

/**
 * A small bold label + thin light-gray hairline — the quiet replacement for
 * CardHead's heavy `bg-bar` band inside compact editors/dialogs. CardHead's
 * dark band stays the standard for page-level sections (lists, dashboard
 * cards); use this only for grouping fields inside a form.
 */
export function SectionDivider({
  label,
  hint,
  right,
  bare,
}: {
  label: string;
  hint?: string;
  right?: ReactNode;
  /** Drop the built-in px-4 — use inside a container (e.g. a Modal form)
   * that already supplies its own horizontal padding, so the section
   * header lines up with the fields below it instead of over-indenting. */
  bare?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-line pb-2 pt-3 ${bare ? "" : "px-4"}`}>
      <div className="min-w-0">
        <h2 className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-fg">{label}</h2>
        {hint && <p className="truncate text-[10.5px] text-fg-subtle">{hint}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function TextRow({
  label,
  value,
  onChange,
  onBlur,
  type = "text",
  inputMode,
  placeholder,
  highlight,
  hint,
  className,
  hideLabel,
  dashed,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  /** Mobile keyboard hint (e.g. "numeric" for an MC/DOT number field). */
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  highlight?: boolean;
  /** Small helper line under the control — e.g. a live unit conversion.
   * Display-only, never sent anywhere. */
  hint?: ReactNode;
  /** Extra classes on the wrapper — e.g. NARROW.state to cap width on
   * desktop for short-value fields. */
  className?: string;
  /** Skip the visible label (still applied as aria-label) — for a field
   * inside a repeating row where the column is identified by position/
   * placeholder instead, and a per-row label would just add dead space. */
  hideLabel?: boolean;
  /** Dashed border — the "not yet created" affordance for a placeholder
   * row in a repeating list (e.g. the RC editor's "add new line" row). */
  dashed?: boolean;
}) {
  return (
    <label className={`flex w-full min-w-0 flex-col gap-1 ${className ?? ""}`}>
      {!hideLabel && (
        <span className={LABEL}>
          {label}
          {highlight && (
            <span className="ml-1.5 text-[8.5px] font-semibold normal-case tracking-normal text-ok">
              auto-filled
            </span>
          )}
        </span>
      )}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-label={hideLabel ? label : undefined}
        className={`w-full min-w-0 ${CONTROL_SIZE} ${highlight ? "border-ok ring-1 ring-ok/30" : ""} ${dashed ? "border-dashed" : ""} ${CONTROL}`}
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
  className,
  hideLabel,
  dashed,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  className?: string;
  /** See TextRow's hideLabel. */
  hideLabel?: boolean;
  /** See TextRow's dashed. */
  dashed?: boolean;
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
          className={`w-full min-w-0 pl-6 sm:pl-5 ${CONTROL_SIZE} ${dashed ? "border-dashed" : ""} ${CONTROL}`}
        />
      </div>
    </label>
  );
}

/** Round an "HH:MM" clock value to the nearest :00/:15/:30/:45 mark — the
 * native time input's own step/arrows mostly respect `step={900}`, but a
 * hand-typed value can still land on any minute, so this is the actual
 * enforcement. Rounding past :52 rolls forward to the next hour's :00. */
function snapToQuarterHour(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  let snapped = Math.round(minute / 15) * 15;
  if (snapped === 60) {
    snapped = 0;
    hour = (hour + 1) % 24;
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
 * inputs instead of one freeform text box — each snapped to :00/:15/:30/:45
 * so the window always reads clean. Combines back into a single
 * "HH:MM - HH:MM" string on change, going through the same onChange/onBlur
 * autosave contract as every other field here. */
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
          step={900}
          value={start}
          onChange={(e) => setTimes(snapToQuarterHour(e.target.value), end)}
          onBlur={onBlur}
          className={`min-w-0 flex-1 ${CONTROL_SIZE} ${CONTROL}`}
        />
        <span className="text-[11px] font-semibold text-fg-muted">to</span>
        <input
          type="time"
          step={900}
          value={end}
          onChange={(e) => setTimes(start, snapToQuarterHour(e.target.value))}
          onBlur={onBlur}
          className={`min-w-0 flex-1 ${CONTROL_SIZE} ${CONTROL}`}
        />
      </div>
    </div>
  );
}

/**
 * Round remove button for a repeating-row editor (phones, links, lanes) —
 * a comfortable 40px tap target on mobile, shrinking to a real desktop
 * button size (28px) past `sm`, same responsive split as CONTROL_SIZE. This
 * replaces the old flat 44px-everywhere circle, the single clearest "bubble"
 * flagged in the field-compactness audit (C.2).
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
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors sm:h-7 sm:w-7 ${BTN_DANGER}`}
    >
      <IconX width={14} height={14} className="sm:hidden" />
      <IconX width={12} height={12} className="hidden sm:block" />
    </button>
  );
}

/**
 * Shared chrome for a repeating-row field editor (PhonesEditor, LinksEditor,
 * LanesEditor) — the label, row list, dashed "Add X" button, and hidden
 * JSON-serialized input every one of them needs. Each row's own content
 * (label picker + input, or two inputs) stays with the caller via
 * `renderRow`, since phone/link/lane rows don't share a shape — only the
 * surrounding list chrome is common.
 */
export function RepeatingFieldList<T>({
  label,
  name,
  rows,
  onAdd,
  addLabel,
  serialize,
  renderRow,
}: {
  label: string;
  name: string;
  rows: T[];
  onAdd: () => void;
  addLabel: string;
  serialize: (rows: T[]) => string;
  renderRow: (row: T, index: number) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i}>{renderRow(row, i)}</div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className={`inline-flex w-fit items-center gap-1.5 rounded-[5px] border-dashed px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
      >
        <IconPlus width={12} height={12} />
        {addLabel}
      </button>
      <input type="hidden" name={name} value={serialize(rows)} />
    </div>
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
  /** See TextRow's hideLabel. */
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
