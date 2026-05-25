"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

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
  pickup_city_zip: string;
  pickup_contact: string;
  pickup_phone: string;
  pickup_window: string;
  /** End of the pickup window. Optional; when blank the row renders
   *  as a single open-ended date instead of a range. */
  pickup_window_end: string;
  delivery_company: string;
  delivery_address: string;
  delivery_city_zip: string;
  delivery_contact: string;
  delivery_phone: string;
  delivery_window: string;
  /** End of the delivery window. Optional; same behavior as
   *  pickup_window_end. */
  delivery_window_end: string;
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
  initial,
  intakeStatusMessage,
  uploads,
}: {
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

  function setValue<K extends keyof LoadDetailsInitial>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="mt-2 overflow-hidden rounded border border-zinc-300 bg-white">
      {/* Card header */}
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-400 px-4 py-2.5 sm:px-5">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">Auto-fill quote details</h2>
        <p className="font-mono text-[11px] text-black">{intakeStatusMessage}</p>
      </div>

      {/* Pickup */}
      <CollapsibleBanner title="Pickup" open={pickupOpen} onToggle={() => setPickupOpen(!pickupOpen)} />
      {pickupOpen ? (
        <>
          <Row label="Company" fieldKey="pickup_company" value={values.pickup_company} onChange={setValue} />
          <Row label="Address" fieldKey="pickup_address" value={values.pickup_address} onChange={setValue} />
          <Row label="City / ZIP" fieldKey="pickup_city_zip" value={values.pickup_city_zip} onChange={setValue} />
          <Row label="Contact" fieldKey="pickup_contact" value={values.pickup_contact} onChange={setValue} />
          <Row label="Phone" fieldKey="pickup_phone" value={values.pickup_phone} onChange={setValue} />
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
      <CollapsibleBanner title="Delivery" open={deliveryOpen} onToggle={() => setDeliveryOpen(!deliveryOpen)} />
      {deliveryOpen ? (
        <>
          <Row label="Company" fieldKey="delivery_company" value={values.delivery_company} onChange={setValue} />
          <Row label="Address" fieldKey="delivery_address" value={values.delivery_address} onChange={setValue} />
          <Row label="City / ZIP" fieldKey="delivery_city_zip" value={values.delivery_city_zip} onChange={setValue} />
          <Row label="Contact" fieldKey="delivery_contact" value={values.delivery_contact} onChange={setValue} />
          <Row label="Phone" fieldKey="delivery_phone" value={values.delivery_phone} onChange={setValue} />
          <DateRangeRow
            label="Window"
            startKey="delivery_window"
            startValue={values.delivery_window}
            endKey="delivery_window_end"
            endValue={values.delivery_window_end}
            onChange={setValue}
          />
        </>
      ) : null}

      {/* Freight */}
      <CollapsibleBanner title="Freight" open={freightOpen} onToggle={() => setFreightOpen(!freightOpen)} />
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
        title="Documents"
        open={docsOpen}
        onToggle={() => setDocsOpen(!docsOpen)}
      />
      {docsOpen ? <DocumentsSection uploads={uploads} /> : null}

      <div className="h-3.5" />
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
      <div className="border-t border-zinc-300 px-4 py-3 sm:px-5">
        <p className="font-mono text-[11px] text-black">
          No customer documents uploaded yet.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 border-t border-zinc-300">
      {uploads.map((u) => (
        <li
          key={u.id}
          className="flex items-center gap-3 px-4 py-2 sm:px-5"
        >
          <span
            aria-hidden
            className="shrink-0 border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black"
          >
            {u.mimeType.startsWith("image/") ? "IMG" : "PDF"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-black">
              {u.originalFilename}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-black">
              <span
                className={
                  "border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.12em] " +
                  (u.source === "quick_quote"
                    ? "border-amber-700 bg-amber-50 text-amber-900"
                    : "border-blue-700 bg-blue-50 text-blue-900")
                }
              >
                {u.source === "quick_quote" ? "Quick Quote" : "Customer Intake"}
              </span>
              <span>{formatDocsSize(u.sizeBytes)}</span>
              <span aria-hidden className="text-zinc-400">
                ·
              </span>
              <span>{formatDocsDate(u.createdAt)}</span>
            </p>
            {u.note ? (
              <p className="mt-0.5 truncate text-xs italic text-black">{u.note}</p>
            ) : null}
          </div>
          {u.signedUrl ? (
            <a
              href={u.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 border border-zinc-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-black transition-colors hover:border-red-600 hover:text-red-700"
            >
              Open
            </a>
          ) : (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              Link unavailable
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatDocsSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDocsDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// âââ Layout primitives âââââââââââââââââââââââââââââââââââââââââââââââ

function CollapsibleBanner({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-2 border-y border-zinc-400 bg-white px-4 pt-3 pb-2 transition-colors hover:bg-zinc-50 sm:px-5"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-[14px] w-1 shrink-0 bg-red-600" />
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-black">{title}</span>
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
      <span aria-hidden className="inline-block h-[14px] w-[3px] shrink-0 bg-zinc-600" />
      <span className="truncate text-xs text-black">{label}</span>
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
          className="text-center font-mono text-sm font-bold text-black"
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
    <div className="flex items-center border border-zinc-300 bg-white focus-within:border-red-600">
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-none bg-transparent px-2 py-1.5 text-sm text-black placeholder:text-zinc-400 focus:outline-none"
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
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
          ? "cursor-not-allowed border-zinc-300 bg-white text-zinc-400"
          : copied
            ? "border-emerald-600 bg-emerald-50 text-emerald-700"
            : "border-zinc-300 bg-white text-black hover:border-zinc-400 hover:bg-zinc-50")
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
