"use client";

import { useState, useTransition } from "react";
import { IconCheck, IconCopy } from "./icons";
import { advanceOnEnter, formatPhoneDisplay } from "@/lib/admin/form-utils";
import { saveLoadDetailsOverrides } from "../actions";

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
  /** Lead row id - identifies the quote_request for the save server
   *  action. Required so operator edits can be persisted. */
  quoteRequestId: string;
  initial: LoadDetailsInitial;
  intakeStatusMessage: string;
  /**
   * Customer-uploaded supporting files (photos + PDFs). Empty array
   * is the "nothing uploaded yet" state. Loader handles signed URL
   * generation server-side at page load.
   */
  uploads: IntakeUploadAdminRow[];
}) {
  const [values, setValues] = useState<LoadDetailsInitial>(initial);
  const [pickupOpen, setPickupOpen] = useState(true);
  const [deliveryOpen, setDeliveryOpen] = useState(true);
  const [freightOpen, setFreightOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);

  // Save status for the "Save edits" footer button. Three states:
  //   idle  - nothing happened recently / inputs may have drifted
  //   saved - last save succeeded (green checkmark, 2.5s flash)
  //   error - last save failed (red message, sticks until next attempt)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function setValue<K extends keyof LoadDetailsInitial>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Any edit after a successful save means the persisted snapshot is
    // now drifted; flip back to idle so the "Saved" checkmark drops.
    if (saveStatus !== "idle") setSaveStatus("idle");
  }

  function runSave() {
    setSaveError(null);
    const fd = new FormData();
    // Send every field on the LoadDetailsInitial shape so the server
    // action stores the complete current state. Empty strings ARE sent
    // (operator-cleared fields stay cleared on refresh).
    for (const [k, v] of Object.entries(values)) {
      fd.append(k, v);
    }
    startSave(async () => {
      const result = await saveLoadDetailsOverrides(quoteRequestId, fd);
      if (result.ok) {
        setSaveStatus("saved");
        setSaveError(null);
        // Hold the "Saved" flash for ~2.5s, then ease back to idle so
        // the footer does not read perpetually green.
        window.setTimeout(() => {
          setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
        }, 2500);
      } else {
        setSaveStatus("error");
        setSaveError(result.reason);
      }
    });
  }

  return (
    <section className="mt-2 border-2 border-black border-l-4 border-l-red-700 bg-[#fafaf6]">
      {/* Card header - freight-document band */}
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-black bg-[#f3f1e9] px-4 py-2.5 sm:px-5">
        <span aria-hidden className="inline-block h-4 w-1 shrink-0 bg-red-700" />
        <h2 className="font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black">
          Load details
        </h2>
        <span className="flex-1" />
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
          />
          <Row
            label="Appointment"
            fieldKey="appointment_status"
            value={values.appointment_status}
            onChange={setValue}
          />
        </>
      ) : null}

      {/* Freight */}
      <CollapsibleBanner ordinal="03" title="Freight" open={freightOpen} onToggle={() => setFreightOpen(!freightOpen)} />
      {freightOpen ? (<>
      <FreightRow
        leftLabel="Commodity"
        leftKey="freight_commodity"
        leftValue={values.freight_commodity}
        rightLabel={"L × W × H"}
        rightKey="freight_dimensions"
        rightValue={values.freight_dimensions}
        onChange={setValue}
      />
      <FreightRow
        leftLabel="Weight"
        leftKey="freight_weight"
        leftValue={values.freight_weight}
        rightLabel="Hazmat"
        rightKey="freight_hazmat"
        rightValue={values.freight_hazmat}
        onChange={setValue}
      />
      <FreightRow
        leftLabel="Pieces"
        leftKey="freight_pieces"
        leftValue={values.freight_pieces}
        rightLabel="Handling"
        rightKey="freight_handling"
        rightValue={values.freight_handling}
        onChange={setValue}
      />
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

      {/* Footer - red bar marker + status mono caps + Build finalized
          button. The button dispatches a custom "workspace-advance" event
          which WorkspaceTabs listens for and uses to switch the active
          tab to finalized. */}
      <div className="flex flex-col gap-2 border-t-[3px] border-double border-black px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-hidden
            className={
              "inline-block h-[14px] w-1 shrink-0 " +
              (saveStatus === "error"
                ? "bg-red-700"
                : saveStatus === "saved"
                  ? "bg-emerald-700"
                  : "bg-red-700")
            }
          />
          <p
            className={
              "font-mono text-[12px] font-bold uppercase tracking-[0.14em] " +
              (saveStatus === "error"
                ? "text-red-700"
                : saveStatus === "saved"
                  ? "text-emerald-800"
                  : "text-black")
            }
          >
            {isSaving
              ? "Saving edits..."
              : saveStatus === "error" && saveError
                ? `Save failed - ${saveError}`
                : saveStatus === "saved"
                  ? "Saved - edits persisted"
                  : intakeStatusMessage}
          </p>
        </div>
        <button
          type="button"
          onClick={runSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 border border-black bg-white px-4 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-black transition-colors hover:bg-[#f3f1e9] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save edits"}
        </button>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("workspace-advance", {
                detail: { to: "finalized" },
              }),
            );
          }}
          className="inline-flex items-center justify-center gap-2 border-0 bg-black px-5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-zinc-800"
        >
          Build finalized \u2192
        </button>
      </div>
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
        <div className="grid grid-cols-[54px_minmax(0,1fr)_120px_70px_90px] border-b border-black bg-[#f3f1e9] px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black">
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
            <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-red-700">
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
                className="text-right font-mono text-[12px] font-bold uppercase tracking-[0.1em] text-red-700 hover:underline"
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
      className="flex w-full items-center justify-between gap-2 border-t-2 border-b border-black bg-[#f3f1e9] px-4 py-2 transition-colors hover:bg-[#ede9dc] sm:px-5"
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-red-700">
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


function LabelWithBar({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-[14px] w-[3px] shrink-0 bg-red-700" />
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
}: {
  label: string;
  startKey: keyof LoadDetailsInitial;
  startValue: string;
  endKey: keyof LoadDetailsInitial;
  endValue: string;
  onChange: ChangeFn;
}) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-zinc-300 px-4 py-2 sm:px-5">
      <LabelWithBar label={label} />
      <div className="grid grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-2">
        <EditableInput
          value={startValue}
          onChange={(v) => onChange(startKey, v)}
          ariaLabel={`${label} start`}
          type="date"
        />
        <span
          aria-hidden
          className="text-center font-mono text-[15px] font-bold text-black"
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
}: {
  leftLabel: string;
  leftKey: keyof LoadDetailsInitial;
  leftValue: string;
  rightLabel: string;
  rightKey: keyof LoadDetailsInitial;
  rightValue: string;
  onChange: ChangeFn;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-t border-zinc-300 px-4 py-2 sm:grid-cols-2 sm:px-5">
      <FreightCell
        label={leftLabel}
        fieldKey={leftKey}
        value={leftValue}
        onChange={onChange}
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
}: {
  label: string;
  fieldKey: keyof LoadDetailsInitial;
  value: string;
  onChange: ChangeFn;
}) {
  return (
    <div className="grid grid-cols-[90px_minmax(0,1fr)_28px] items-center gap-2">
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
        className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-1.5 text-[15px] text-black placeholder:text-zinc-700 focus:outline-none"
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
}: {
  cityKey: keyof LoadDetailsInitial;
  cityValue: string;
  zipKey: keyof LoadDetailsInitial;
  zipValue: string;
  onChange: ChangeFn;
}) {
  const combined = [cityValue, zipValue].filter(Boolean).join(" ").trim();
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-zinc-300 px-4 py-2 sm:px-5">
      <LabelWithBar label="City / ZIP" />
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-center gap-2">
        <EditableInput
          value={cityValue}
          onChange={(v) => onChange(cityKey, v)}
          ariaLabel="City and state"
        />
        <EditableInput
          value={zipValue}
          onChange={(v) => onChange(zipKey, v)}
          ariaLabel="ZIP code"
        />
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
