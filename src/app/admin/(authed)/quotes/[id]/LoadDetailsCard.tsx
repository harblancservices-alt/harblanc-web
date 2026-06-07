"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import { advanceOnEnter, formatPhoneDisplay } from "@/lib/admin/form-utils";
import { lookupZipDetails } from "../actions";

/**
 * Phase REBUILD-1c â editable load-detail card.
 *
 * Server-side computes a flat LoadDetailsInitial object from two sources
 * (in order of precedence per field):
 *   1. shipment_intake row (when customer has progressed through intake)
 *   2. quote_requests row (Quick Quote initial data: commodity, weight,
 *      pickup_city/state/zip, delivery_city/state/zip, pickup_date)
 *
 * Local state on the client starts from the initial prop and lets the
 * operator edit any field. Edits are NOT persisted yet â they live in
 * this component’s useState until a future REBUILD phase adds a
 * server action. The Copy button on each row writes the CURRENT value
 * (post-edit) to the clipboard with a 1500ms checkmark.
 *
 * If the customer submits intake AFTER this card mounted, the parent
 * page re-renders with new initial values but useState ignores prop
 * changes by default. The page passes `key={intakeSnapshotKey}` so a
 * fresh submission unmounts and remounts this card with the new values.
 */


// US state codes for the ZIP-row dropdown. Order: alphabetical by code.
// Includes DC + the 50 states (covers every ZIP in the zipcodes dataset).
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID",
  "IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC",
  "ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD",
  "TN","TX","UT","VA","VT","WA","WI","WV","WY",
] as const;

// "City, ST" combined string ⇄ { city, state } pair. Stable when the
// combined string is malformed (no comma, etc.) — splits on the LAST
// comma so "St. Louis, MO" parses correctly.
function parseCityState(combined: string): { city: string; state: string } {
  const idx = combined.lastIndexOf(",");
  if (idx < 0) return { city: combined.trim(), state: "" };
  return {
    city: combined.slice(0, idx).trim(),
    state: combined.slice(idx + 1).trim().toUpperCase(),
  };
}
function joinCityState(city: string, state: string): string {
  const c = city.trim();
  const s = state.trim().toUpperCase();
  if (!c && !s) return "";
  if (!s) return c;
  if (!c) return s;
  return `${c}, ${s}`;
}
export type LoadDetailsInitial = {
  pickup_company: string;
  pickup_address: string;
  /** City + State combined ("Houston, TX"). ZIP renders in its own input on the same row, see pickup_zip below. */
  pickup_city_state: string;
  pickup_zip: string;
  pickup_contact: string;
  pickup_phone: string;
  pickup_window: string;
  /** End of the pickup window. Optional; when blank the row renders
   *  as a single open-ended date instead of a range. */
  pickup_window_end: string;
  delivery_company: string;
  delivery_address: string;
  delivery_city_state: string;
  delivery_zip: string;
  delivery_contact: string;
  delivery_phone: string;
  delivery_window: string;
  /** End of the delivery window. Optional; same behavior as
   *  pickup_window_end. */
  delivery_window_end: string;
  /** Customer's scheduling posture, surfaced as a friendly string
   *  ("Flexible", "Appointment needed", etc.). Blank when the
   *  customer hasn't answered. Read-only; dispatch uses it to know
   *  whether to call before confirming exact times. */
  appointment_status: string;
  freight_commodity: string;
  freight_weight: string;
  freight_pieces: string;
  freight_dimensions: string;
  freight_hazmat: string;
  freight_handling: string;
};

/**
 * One row of admin-side intake upload metadata. The page.tsx loader
 * batch-signs the storage paths and passes the resulting URLs down;
 * the card never touches Supabase Storage directly. signedUrl may be
 * null when the sign step failed — the row still renders, just
 * without an Open affordance.
 */
export type IntakeUploadAdminRow = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
  signedUrl: string | null;
  /** Where this file came from: anonymous Quick Quote form, or
   *  token-gated customer intake. The admin row renders a small chip
   *  showing which. */
  source: "quick_quote" | "customer_intake";
};

export function LoadDetailsCard({
  quoteRequestId,
  initial,
  intakeStatusMessage,
  uploads,
}: {
  /** Lead row id — retained on the public API for future re-introduction
   *  of a per-card save action. Currently unused; the merged Quote Range
   *  workspace below owns the build/send action flow. */
  quoteRequestId: string;
  initial: LoadDetailsInitial;
  /** Retained on the type for callers; no longer surfaced inside the
   *  card now that the footer bar is gone. */
  intakeStatusMessage: string;
  /**
   * Customer-uploaded supporting files (photos + PDFs). Empty array
   * is the "nothing uploaded yet" state. Loader handles signed URL
   * generation server-side at page load.
   */
  uploads: IntakeUploadAdminRow[];
}) {
  // quoteRequestId + intakeStatusMessage are retained on the prop type
  // for callers but the merged-into-load-details layout no longer renders
  // a save footer or an intake status banner. Voids silence unused-arg
  // warnings until/unless those affordances come back.
  void quoteRequestId;
  void intakeStatusMessage;
  const [values, setValues] = useState<LoadDetailsInitial>(initial);
  const [pickupOpen, setPickupOpen] = useState(true);
  const [deliveryOpen, setDeliveryOpen] = useState(true);
  const [freightOpen, setFreightOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);

  function setValue<K extends keyof LoadDetailsInitial>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="mt-2 border-2 border-black border-l-4 border-l-black bg-[#fafaf6]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-2 sm:px-5">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black">
          Load details
        </h2>
        <span className="border border-black bg-white px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-black">
          {intakeStatusMessage}
        </span>
      </div>

      {/* Pickup */}
      <CollapsibleBanner ordinal="01" title="Shipper" open={pickupOpen} onToggle={() => setPickupOpen(!pickupOpen)} />
      {pickupOpen ? (
        <>
          <Row label="Company" fieldKey="pickup_company" value={values.pickup_company} onChange={setValue} />
          <Row label="Address" fieldKey="pickup_address" value={values.pickup_address} onChange={setValue} />
          <CityZipRow
            cityKey="pickup_city_state"
            cityValue={values.pickup_city_state}
            zipKey="pickup_zip"
            zipValue={values.pickup_zip}
            onChange={setValue}
            fromQuickQuote
          />
          <Row label="Contact" fieldKey="pickup_contact" value={values.pickup_contact} onChange={setValue} />
          <PhoneRow label="Phone" fieldKey="pickup_phone" value={values.pickup_phone} onChange={setValue} />
          <DateRangeRow
            label="Window"
            startKey="pickup_window"
            startValue={values.pickup_window}
            endKey="pickup_window_end"
            endValue={values.pickup_window_end}
            onChange={setValue}
            startFromQuickQuote
          />
        </>
      ) : null}

      {/* Delivery */}
      <CollapsibleBanner ordinal="02" title="Consignee" open={deliveryOpen} onToggle={() => setDeliveryOpen(!deliveryOpen)} />
      {deliveryOpen ? (
        <>
          <Row label="Company" fieldKey="delivery_company" value={values.delivery_company} onChange={setValue} />
          <Row label="Address" fieldKey="delivery_address" value={values.delivery_address} onChange={setValue} />
          <CityZipRow
            cityKey="delivery_city_state"
            cityValue={values.delivery_city_state}
            zipKey="delivery_zip"
            zipValue={values.delivery_zip}
            onChange={setValue}
            fromQuickQuote
          />
          <Row label="Contact" fieldKey="delivery_contact" value={values.delivery_contact} onChange={setValue} />
          <PhoneRow label="Phone" fieldKey="delivery_phone" value={values.delivery_phone} onChange={setValue} />
          <DateRangeRow
            label="Window"
            startKey="delivery_window"
            startValue={values.delivery_window}
            endKey="delivery_window_end"
            endValue={values.delivery_window_end}
            onChange={setValue}
            startFromQuickQuote
          />
        </>
      ) : null}

      {/* Freight */}
      <CollapsibleBanner ordinal="03" title="Freight" open={freightOpen} onToggle={() => setFreightOpen(!freightOpen)} />
      {freightOpen ? (<>
      {/* Commodity row — Dimensions removed. Single FreightCell in the
          same outer 2-col grid pattern as Weight below it. */}
      <div className="grid grid-cols-1 gap-3 border-t border-zinc-300 px-4 py-2 sm:grid-cols-2 sm:px-5">
        <FreightCell
          label="Commodity"
          fieldKey="freight_commodity"
          value={values.freight_commodity}
          onChange={setValue}
          fromQuickQuote
        />
      </div>
      {/* Weight row — Hazmat removed. Single FreightCell wrapped in the
          same outer 2-col grid pattern as the Commodity / Dimensions row
          above so the rhythm stays consistent (empty right cell on
          desktop, stacked single-column on mobile). Pieces / Handling
          row also removed entirely per operator. */}
      <div className="grid grid-cols-1 gap-3 border-t border-zinc-300 px-4 py-2 sm:grid-cols-2 sm:px-5">
        <FreightCell
          label="Weight"
          fieldKey="freight_weight"
          value={values.freight_weight}
          onChange={setValue}
          fromQuickQuote
        />
      </div>
      </>) : null}

      {/* Documents — peer section below Freight (not interleaved with
          the Freight rows). Holds the customer-uploaded supporting
          files. Same CollapsibleBanner pattern as Pickup / Delivery /
          Freight so the card reads as four parallel sections. */}
      <CollapsibleBanner
        ordinal="04"
        title="Documents"
        open={docsOpen}
        onToggle={() => setDocsOpen(!docsOpen)}
      />
      {docsOpen ? <DocumentsSection uploads={uploads} /> : null}

    </section>
  );
}

/**
 * Documents section body. Single column inside the LoadDetailsCard —
 * no nested grids, no card chrome. Empty state is one line; with
 * uploads, a thin divided file list.
 */
function DocumentsSection({ uploads }: { uploads: IntakeUploadAdminRow[] }) {
  if (uploads.length === 0) {
    return (
      <div className="px-4 py-3 sm:px-5">
        <div className="border border-dashed border-zinc-400 bg-white px-3 py-4 text-center">
          <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black">
            No customer documents uploaded yet
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 pb-3 sm:px-5">
      <div className="border border-black bg-white">
        <div className="grid grid-cols-[54px_minmax(0,1fr)_120px_70px_90px] border-b border-black/30 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
          <span>Type</span>
          <span>Filename</span>
          <span>Source</span>
          <span className="text-right">Size</span>
          <span className="text-right">Action</span>
        </div>
        {uploads.map((u, idx) => (
          <div
            key={u.id}
            className={
              "grid grid-cols-[54px_minmax(0,1fr)_120px_70px_90px] items-center gap-2 px-3 py-2 font-mono text-[13px] " +
              (idx === uploads.length - 1 ? "" : "border-b border-zinc-300")
            }
          >
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-black">
              {u.mimeType.startsWith("image/") ? "IMG" : "PDF"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] text-black">{u.originalFilename}</p>
              {u.note ? (
                <p className="mt-0.5 truncate font-sans text-[12px] italic text-black">
                  {u.note}
                </p>
              ) : null}
            </div>
            <span className="font-mono text-[12px] text-black">
              {u.source === "quick_quote" ? "Quick Quote" : "Customer Intake"}
            </span>
            <span className="text-right font-mono text-[12px] text-black tabular-nums">
              {formatDocsSize(u.sizeBytes)}
            </span>
            {u.signedUrl ? (
              <a
                href={u.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-right font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-black hover:underline"
              >
                Open \u2197
              </a>
            ) : (
              <span className="text-right font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-black">
                Unavailable
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDocsSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// âââ Layout primitives âââââââââââââââââââââââââââââââââââââââââââââââ

function CollapsibleBanner({
  ordinal,
  title,
  open,
  onToggle,
}: {
  /** Two-digit section ordinal stamped in red mono before the title. */
  ordinal: string;
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-2 border-t border-b border-black/30 bg-[#fafaf6] px-4 py-2 transition-colors hover:bg-[#f3f1e9] sm:px-5"
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
          {ordinal}
        </span>
        <span className="font-mono text-[13px] font-bold uppercase tracking-[0.18em] text-black">
          {title}
        </span>
      </span>
      <IconSectionChevron open={open} />
    </button>
  );
}

function IconSectionChevron({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={"h-4 w-4 shrink-0 text-black transition-transform " + (open ? "" : "-rotate-90")}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}


function LabelWithBar({
  label,
  fromQuickQuote = false,
}: {
  label: string;
  /** When true, the parent row wrapper applies the panel wash
   *  (`bg-red-200 border-l-[3px] border-l-red-700`) to mark this row
   *  as a value the customer submitted on the public /quote form.
   *  The label itself stays black — only the panel is highlighted. */
  fromQuickQuote?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-[14px] w-[3px] shrink-0 bg-black" />
      <span className="truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-black">
        {label}
      </span>
    </span>
  );
}

type ChangeFn = <K extends keyof LoadDetailsInitial>(key: K, value: string) => void;

function Row({
  label,
  fieldKey,
  value,
  onChange,
}: {
  label: string;
  fieldKey: keyof LoadDetailsInitial;
  value: string;
  onChange: ChangeFn;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-zinc-300 px-4 py-2 sm:px-5">
      <LabelWithBar label={label} />
      <EditableInput
        value={value}
        onChange={(v) => onChange(fieldKey, v)}
        ariaLabel={label}
      />
      <CopyButton value={value} ariaLabel={label} />
    </div>
  );
}

/**
 * Window row — two text inputs side-by-side on the SAME line as the
 * label, with an em-dash separator between them. Used for Pickup and
 * Delivery window ranges. The right cell carries no Copy button (the
 * value is composite — copy the start or end individually by selecting
 * the input directly).
 */
function DateRangeRow({
  label,
  startKey,
  startValue,
  endKey,
  endValue,
  onChange,
  startFromQuickQuote = false,
}: {
  label: string;
  startKey: keyof LoadDetailsInitial;
  startValue: string;
  endKey: keyof LoadDetailsInitial;
  endValue: string;
  onChange: ChangeFn;
  startFromQuickQuote?: boolean;
}) {
  return (
    <div
      className={"grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-zinc-300 px-4 py-2 sm:px-5 " + (startFromQuickQuote ? "border-l-[5px] border-l-red-700" : "")}
      style={startFromQuickQuote ? { backgroundColor: "#fca5a5" } : undefined}
    >
      <LabelWithBar label={label} fromQuickQuote={startFromQuickQuote} />
      {/* Mobile: start date stacks above end date — native date inputs
          need ~110-120px each to render mm/dd/yyyy, which doesn't fit in
          the ~180px content column on mobile. mdash separator is hidden
          on mobile so it doesn't render as an orphan dash on its own row. */}
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] sm:items-center sm:gap-2">
        <EditableInput
          value={startValue}
          onChange={(v) => onChange(startKey, v)}
          ariaLabel={`${label} start`}
          type="date"
        />
        <span
          aria-hidden
          className="hidden text-center font-mono text-[15px] font-bold text-black sm:block"
        >
          &mdash;
        </span>
        <EditableInput
          value={endValue}
          onChange={(v) => onChange(endKey, v)}
          ariaLabel={`${label} end`}
          type="date"
        />
      </div>
      <span aria-hidden />
    </div>
  );
}

function FreightRow({
  leftLabel,
  leftKey,
  leftValue,
  rightLabel,
  rightKey,
  rightValue,
  onChange,
  leftFromQuickQuote = false,
}: {
  leftLabel: string;
  leftKey: keyof LoadDetailsInitial;
  leftValue: string;
  rightLabel: string;
  rightKey: keyof LoadDetailsInitial;
  rightValue: string;
  onChange: ChangeFn;
  leftFromQuickQuote?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-zinc-300 px-4 py-2 sm:grid-cols-2 sm:px-5">
      <FreightCell
        label={leftLabel}
        fieldKey={leftKey}
        value={leftValue}
        onChange={onChange}
        fromQuickQuote={leftFromQuickQuote}
      />
      <FreightCell
        label={rightLabel}
        fieldKey={rightKey}
        value={rightValue}
        onChange={onChange}
      />
    </div>
  );
}

function FreightCell({
  label,
  fieldKey,
  value,
  onChange,
  fromQuickQuote = false,
}: {
  label: string;
  fieldKey: keyof LoadDetailsInitial;
  value: string;
  onChange: ChangeFn;
  fromQuickQuote?: boolean;
}) {
  return (
    <div
      className={"grid grid-cols-[90px_minmax(0,1fr)_28px] items-center gap-2 " + (fromQuickQuote ? "border-l-[5px] border-l-red-700 -mx-2 px-2 py-1" : "")}
      style={fromQuickQuote ? { backgroundColor: "#fca5a5" } : undefined}
    >
      <LabelWithBar label={label} fromQuickQuote={fromQuickQuote} />
      <EditableInput
        value={value}
        onChange={(v) => onChange(fieldKey, v)}
        ariaLabel={label}
      />
      <CopyButton value={value} ariaLabel={label} />
    </div>
  );
}

function EditableInput({
  value,
  onChange,
  ariaLabel,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  /**
   * Override the input type. Defaults to "text". Use "date" to get
   * the native calendar picker — DateRangeRow passes that through.
   */
  type?: string;
}) {
  return (
    <div className="flex items-center border border-black bg-white focus-within:border-red-700">
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={advanceOnEnter}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-1.5 text-[16px] text-black placeholder:text-zinc-700 focus:outline-none sm:text-[15px]"
      />
    </div>
  );
}

/**
 * Compact copy-to-clipboard button used in load-detail rows. Writes
 * the current cell value to the clipboard and shows a check icon for
 * ~1.5s. Disabled when the value is empty so the operator can't copy
 * blank cells. Rendered into the fixed 32px / 28px trailing column of
 * Row and FreightCell, so the row layout stays unchanged.
 */
function CopyButton({
  value,
  ariaLabel,
}: {
  value: string;
  ariaLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const disabled = value.trim().length === 0;

  function handleClick() {
    if (disabled) return;
    // navigator.clipboard.writeText requires a secure context (HTTPS or
    // localhost). In production both apply; the catch is defensive so a
    // misconfigured preview environment surfaces the failure in console
    // instead of silently swallowing the click.
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((err) => {
        console.error("[CopyButton] clipboard write failed", err);
      });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={copied ? `Copied ${ariaLabel}` : `Copy ${ariaLabel}`}
      title={copied ? "Copied" : "Copy"}
      className={
        "inline-flex h-7 w-7 shrink-0 items-center justify-center border transition-colors " +
        (disabled
          ? "cursor-not-allowed border-zinc-400 bg-white text-black"
          : copied
            ? "border-emerald-700 bg-emerald-50 text-emerald-800"
            : "border-black bg-white text-black hover:bg-[#f3f1e9]")
      }
    >
      {copied ? (
        <IconCheck className="h-3.5 w-3.5" />
      ) : (
        <IconCopy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}


/**
 * Two-column row used for City + ZIP. City takes the left input,
 * ZIP takes the right (narrower). Same chrome as a normal Row,
 * placed inside the existing 3-col grid layout so the trailing
 * 32px-wide copy column stays aligned with neighboring rows --
 * but the copy button here applies to the COMBINED "City, ST ZIP"
 * string so the operator can paste it as a single address line.
 */
function CityZipRow({
  cityKey,
  cityValue,
  zipKey,
  zipValue,
  onChange,
  fromQuickQuote = false,
}: {
  cityKey: keyof LoadDetailsInitial;
  cityValue: string;
  zipKey: keyof LoadDetailsInitial;
  zipValue: string;
  onChange: ChangeFn;
  fromQuickQuote?: boolean;
}) {
  // Split the persisted "City, ST" combined string for editing. The
  // operator sees two inputs: a city text + a small state dropdown
  // (no label — position alone). Edits flow back through onChange as
  // the rebuilt "City, ST" combined string so the data model is
  // unchanged. ZIP onBlur looks up the dataset and overwrites both.
  const { city: parsedCity, state: parsedState } = parseCityState(cityValue);
  const combined = [cityValue, zipValue].filter(Boolean).join(" ").trim();

  async function handleZipBlur(z: string) {
    const trimmed = z.trim();
    if (!/^\d{5}$/.test(trimmed)) return;
    const hit = await lookupZipDetails(trimmed);
    if (hit) onChange(cityKey, joinCityState(hit.city, hit.state));
  }

  return (
    <div
      className={"grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-zinc-300 px-4 py-2 sm:px-5 " + (fromQuickQuote ? "border-l-[5px] border-l-red-700" : "")}
      style={fromQuickQuote ? { backgroundColor: "#fca5a5" } : undefined}
    >
      <LabelWithBar label="City / ZIP" fromQuickQuote={fromQuickQuote} />
      {/* Mobile: row 1 = City (wide) + State (narrow); row 2 = ZIP full
          width. sm+: City + State on the left, ZIP on the right of
          the outer 2-col grid. */}
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center sm:gap-2">
        <div className="flex items-stretch gap-1.5">
          <div className="min-w-0 flex-1">
            <EditableInput
              value={parsedCity}
              onChange={(v) => onChange(cityKey, joinCityState(v, parsedState))}
              ariaLabel="City"
            />
          </div>
          <div className="border border-black bg-white focus-within:border-red-700">
            <select
              value={parsedState}
              onChange={(e) => onChange(cityKey, joinCityState(parsedCity, e.target.value))}
              onKeyDown={advanceOnEnter}
              aria-label="State"
              className="block w-[58px] border-0 bg-transparent px-1.5 py-1.5 text-center font-mono text-[16px] font-medium text-black focus:outline-none sm:text-[15px]"
            >
              <option value=""></option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="border border-black bg-white focus-within:border-red-700">
          <input
            type="text"
            inputMode="numeric"
            value={zipValue}
            onChange={(e) => onChange(zipKey, e.target.value)}
            onBlur={(e) => void handleZipBlur(e.target.value)}
            onKeyDown={advanceOnEnter}
            aria-label="ZIP code"
            maxLength={5}
            className="block w-full border-0 bg-transparent px-2.5 py-1.5 text-[16px] text-black placeholder:text-zinc-700 focus:outline-none sm:text-[15px]"
          />
        </div>
      </div>
      <CopyButton value={combined} ariaLabel="city and ZIP" />
    </div>
  );
}

/**
 * Phone row variant — same Row layout but routes the typed value
 * through formatPhoneDisplay so the field shows progressive
 * (XXX) XXX-XXXX formatting as the operator types. Storage shape is
 * the formatted string (matches the customer-facing PhoneField in
 * intake-fields.tsx).
 */
function PhoneRow({
  label,
  fieldKey,
  value,
  onChange,
}: {
  label: string;
  fieldKey: keyof LoadDetailsInitial;
  value: string;
  onChange: ChangeFn;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-zinc-300 px-4 py-2 sm:px-5">
      <LabelWithBar label={label} />
      <EditableInput
        value={value}
        onChange={(v) => onChange(fieldKey, formatPhoneDisplay(v))}
        ariaLabel={label}
      />
      <CopyButton value={value} ariaLabel={label} />
    </div>
  );
}
