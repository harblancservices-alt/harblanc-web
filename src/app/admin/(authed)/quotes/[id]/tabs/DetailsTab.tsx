"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  saveLoadDetailsOverrides,
  lookupZipDetails,
} from "../../actions";
import type { LoadDetailsInitial } from "../LoadDetailsCard";
import { advanceOnEnter, formatPhoneDisplay } from "@/lib/admin/form-utils";
import { IconCheck, IconCopy } from "../icons";

/**
 * Details tab -- dark workstation surface (Phase B restyle).
 *
 * Replaces the cream V4.5 surface with the dark zinc idiom that
 * matches the new Load workspace. The save path, ZIP lookup path,
 * FormData key set, and intakeSnapshotKey remount pattern are
 * preserved verbatim.
 *
 * Surface (top -> bottom inside the parent "Load details" card):
 *   1. LaneContextStrip  - compact 4-cell mono strip. The big lane
 *      viz now lives in the page-level LaneHero; this strip only
 *      shows window/miles/route status as edit context, deliberately
 *      shrunk so it does not duplicate the hero.
 *   2. ShipperOfRecordCard + FreightSummaryCard - dark two-column row.
 *   3. EditableLoadDetailsCard - the form. 01 Shipper | 02 Consignee
 *      side-by-side; 03 Freight spans both columns. Each subgroup
 *      has its own kicker header and its own thin outline so the
 *      Shipper/Consignee/Freight grouping stays visually distinct.
 *
 * SAVE BEHAVIOR (unchanged):
 *   - Each input''s onBlur schedules a debounced save (~300ms after
 *     last blur). One save in flight at a time; coalesced follow-up.
 *   - The FULL editable form state (all 18 keys) is posted on every
 *     save. The action overwrites the entire JSONB column, so partial
 *     posts would clobber unchanged fields.
 *   - SaveStatusPill: "Saved HH:MM" / "Saving" / "Save failed".
 *
 * UNCHANGED:
 *   - saveLoadDetailsOverrides signature and call site.
 *   - lookupZipDetails behavior on ZIP onBlur.
 *   - LoadDetailsInitial shape.
 *   - EDITABLE_KEYS array and FormData posting.
 *   - intakeSnapshotKey-driven remount pattern at page.tsx.
 *   - advanceOnEnter keyboard handler on every input/select.
 *   - formatPhoneDisplay on phone fields.
 *   - CopyButton clipboard write semantics.
 */

// ---------------------------------------------------------------------------
// Constants (unchanged from V4.5)
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 300;

const EDITABLE_KEYS = [
  "pickup_company",
  "pickup_address",
  "pickup_city_state",
  "pickup_zip",
  "pickup_contact",
  "pickup_phone",
  "pickup_window",
  "pickup_window_end",
  "delivery_company",
  "delivery_address",
  "delivery_city_state",
  "delivery_zip",
  "delivery_contact",
  "delivery_phone",
  "delivery_window",
  "delivery_window_end",
  "freight_commodity",
  "freight_weight",
] as const satisfies ReadonlyArray<keyof LoadDetailsInitial>;

type EditableKey = (typeof EDITABLE_KEYS)[number];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID",
  "IL","IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC",
  "ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD",
  "TN","TX","UT","VA","VT","WA","WI","WV","WY",
] as const;

// Quick-Quote-mandatory subset. Red attention treatment, preserved from V4.5
// but rendered with desaturated dark-mode reds.
const QUICK_QUOTE_KEYS = new Set<EditableKey>([
  "pickup_zip",
  "pickup_window",
  "delivery_zip",
  "freight_commodity",
  "freight_weight",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DetailsTabProps = {
  quoteRequestId: string;
  initial: LoadDetailsInitial;
  /** Shipper of Record (lead contact) -- read-only, lifted from OperatorHeader. */
  shipperOfRecord: { name: string; phone: string; email: string };
  /** Server-computed route miles for the Lane card. Null if unroutable. */
  miles: number | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

// ---------------------------------------------------------------------------
// Helpers (verbatim from V4.5)
// ---------------------------------------------------------------------------

function isNextRedirect(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

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
  return c + ", " + s;
}

function formatClockHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return hh + ":" + mm;
}

function toTitleCase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatFreightWeight(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 0) return trimmed;
  const n = Number(digits);
  if (!Number.isFinite(n)) return trimmed;
  return n.toLocaleString("en-US") + " lbs";
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return m[2] + "/" + m[3] + "/" + m[1];
}

function formatWindow(start: string, end: string): string | null {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return null;
  if (s && e) return formatDateDisplay(s) + " \u2014 " + formatDateDisplay(e);
  return formatDateDisplay(s || e);
}

// ---------------------------------------------------------------------------
// Debounced save hook (verbatim from V4.5)
// ---------------------------------------------------------------------------

function useDebouncedSave(
  quoteRequestId: string,
  valuesRef: React.MutableRefObject<LoadDetailsInitial>,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);
  const inflightRef = useRef<boolean>(false);
  const pendingRef = useRef<boolean>(false);

  const triggerSave = useCallback(async () => {
    if (inflightRef.current) {
      pendingRef.current = true;
      return;
    }
    inflightRef.current = true;
    setStatus("saving");

    const formData = new FormData();
    const current = valuesRef.current;
    for (const key of EDITABLE_KEYS) {
      formData.append(key, current[key] ?? "");
    }

    try {
      const result = await saveLoadDetailsOverrides(
        quoteRequestId,
        formData,
      );
      inflightRef.current = false;
      if (result.ok) {
        setStatus("saved");
        setLastSavedAt(new Date());
        setErrorMessage(null);
      } else {
        setStatus("error");
        setErrorMessage(result.reason);
      }
    } catch (err) {
      if (isNextRedirect(err)) throw err;
      inflightRef.current = false;
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Unknown error saving",
      );
    }

    if (pendingRef.current) {
      pendingRef.current = false;
      void triggerSave();
    }
  }, [quoteRequestId, valuesRef]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void triggerSave();
    }, SAVE_DEBOUNCE_MS);
  }, [triggerSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { scheduleSave, status, errorMessage, lastSavedAt };
}

// ---------------------------------------------------------------------------
// DetailsTab (dark restyle)
// ---------------------------------------------------------------------------

export function DetailsTab({
  quoteRequestId,
  initial,
  shipperOfRecord,
  miles,
}: DetailsTabProps) {
  const [values, setValues] = useState<LoadDetailsInitial>(initial);
  const valuesRef = useRef<LoadDetailsInitial>(values);
  valuesRef.current = values;

  const { scheduleSave, status, errorMessage, lastSavedAt } =
    useDebouncedSave(quoteRequestId, valuesRef);

  const setValue = useCallback(
    <K extends keyof LoadDetailsInitial>(key: K, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <div className="space-y-3 bg-zinc-950 px-3 py-3 text-zinc-100 sm:space-y-4 sm:px-4 sm:py-4">
      <LaneContextStrip values={values} miles={miles} />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1.3fr_1fr]">
        <ShipperOfRecordCard contact={shipperOfRecord} />
        <FreightSummaryCard
          commodity={values.freight_commodity}
          weight={values.freight_weight}
        />
      </div>

      <EditableLoadDetailsCard
        values={values}
        setValue={setValue}
        scheduleSave={scheduleSave}
        saveStatus={status}
        errorMessage={errorMessage}
        lastSavedAt={lastSavedAt}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LaneContextStrip -- compact replacement for the old big LaneSummaryCard
// ---------------------------------------------------------------------------

export function LaneContextStrip({
  values,
  miles,
}: {
  values: LoadDetailsInitial;
  miles: number | null;
}) {
  const pickupZip = values.pickup_zip.trim();
  const deliveryZip = values.delivery_zip.trim();
  const pickupWindow = formatWindow(
    values.pickup_window,
    values.pickup_window_end,
  );
  const deliveryWindow = formatWindow(
    values.delivery_window,
    values.delivery_window_end,
  );
  const mapHref =
    pickupZip && deliveryZip
      ? "https://maps.apple.com/?saddr=" +
        encodeURIComponent(pickupZip) +
        "&daddr=" +
        encodeURIComponent(deliveryZip) +
        "&dirflg=d"
      : null;

  return (
    <section
      aria-label="Lane edit context"
      className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 sm:grid-cols-4"
    >
      <Cell
        label="Pickup window"
        value={pickupWindow}
        emptyHint="Not set"
        emptyTone="warn"
      />
      <Cell
        label="Delivery window"
        value={deliveryWindow}
        emptyHint="Not set"
        emptyTone="warn"
      />
      <Cell
        label="Miles"
        value={miles != null ? miles.toLocaleString() + " mi" : null}
        emptyHint="—"
        emptyTone="muted"
        mono
      />
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.20em] text-zinc-500">
          Route
        </p>
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11.5px] font-medium uppercase tracking-[0.12em] text-zinc-200 transition-colors hover:text-white"
          >
            Open in Maps
            <span aria-hidden className="text-zinc-500">
              {"\u2197"}
            </span>
          </a>
        ) : (
          <p className="mt-0.5 font-mono text-[11.5px] uppercase tracking-[0.12em] text-zinc-600">
            Needs both ZIPs
          </p>
        )}
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  emptyHint,
  emptyTone,
  mono,
}: {
  label: string;
  value: string | null;
  emptyHint: string;
  emptyTone: "warn" | "muted";
  mono?: boolean;
}) {
  const hasValue = (value ?? "").trim().length > 0;
  const valueClass =
    "mt-0.5 truncate text-[12.5px] " +
    (mono ? "font-mono tabular-nums " : "") +
    (hasValue
      ? "text-zinc-100"
      : emptyTone === "warn"
        ? "font-mono text-[11.5px] uppercase tracking-[0.12em] text-red-300"
        : "font-mono text-[11.5px] uppercase tracking-[0.12em] text-zinc-500");
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] font-medium uppercase tracking-[0.20em] text-zinc-500">
        {label}
      </p>
      <p className={valueClass}>{hasValue ? value : emptyHint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shipper of Record (read-only, dark)
// ---------------------------------------------------------------------------

function ShipperOfRecordCard({
  contact,
}: {
  contact: { name: string; phone: string; email: string };
}) {
  const phoneHref = "tel:" + contact.phone.replace(/[^\d+]/g, "");
  const mailHref = "mailto:" + contact.email;
  return (
    <section className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <header className="border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-300">
          Shipper of record
        </p>
      </header>
      <ContactRow
        label="Customer"
        value={contact.name}
        ariaLabel="customer name"
      />
      <ContactRow
        label="Phone"
        value={formatPhoneDisplay(contact.phone) || contact.phone}
        mono
        actionHref={phoneHref}
        actionLabel="Tap to call"
        ariaLabel="phone"
        topBorder
      />
      <ContactRow
        label="Email"
        value={contact.email}
        mono
        actionHref={mailHref}
        actionLabel="Draft email"
        ariaLabel="email"
        topBorder
      />
    </section>
  );
}

function ContactRow({
  label,
  value,
  mono,
  actionHref,
  actionLabel,
  ariaLabel,
  topBorder,
}: {
  label: string;
  value: string;
  mono?: boolean;
  actionHref?: string;
  actionLabel?: string;
  ariaLabel: string;
  topBorder?: boolean;
}) {
  const valueCls =
    "truncate text-[13.5px] text-zinc-100 " + (mono ? "font-mono " : "");
  const inner = (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
      <div className="w-[68px] shrink-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="min-w-0 flex-1">
        <p className={valueCls}>{value || "\u2014"}</p>
      </div>
    </div>
  );
  return (
    <div
      className={
        "flex items-stretch " + (topBorder ? "border-t border-zinc-800" : "")
      }
    >
      {actionHref ? (
        <a
          href={actionHref}
          className="flex min-w-0 flex-1 transition-colors hover:bg-zinc-900/60"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      <div className="flex shrink-0 items-center gap-2 pr-2 sm:pr-3">
        {actionHref && actionLabel ? (
          <a
            href={actionHref}
            className="hidden font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:text-zinc-100 sm:inline-block"
          >
            {actionLabel}
          </a>
        ) : null}
        <CopyButton value={value} ariaLabel={ariaLabel} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FreightSummaryCard (dark)
// ---------------------------------------------------------------------------

function FreightSummaryCard({
  commodity,
  weight,
}: {
  commodity: string;
  weight: string;
}) {
  const display = toTitleCase(commodity);
  const wt = formatFreightWeight(weight);
  const hasAny = display.length > 0 || wt.length > 0;
  return (
    <section
      aria-label="Freight summary"
      className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40"
    >
      <header className="border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-300">
          Freight
        </p>
      </header>
      <div className="px-3 py-3">
        {hasAny ? (
          <>
            {display.length > 0 ? (
              <p className="text-[16px] font-medium leading-tight text-zinc-100">
                {display}
              </p>
            ) : null}
            {wt.length > 0 ? (
              <p
                className={
                  "font-mono text-[12px] tabular-nums text-zinc-300 " +
                  (display.length > 0 ? "mt-1" : "")
                }
              >
                {wt}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] text-zinc-500">{"\u2014"}</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editable load details card
// ---------------------------------------------------------------------------

type ChangeFn = <K extends keyof LoadDetailsInitial>(
  key: K,
  value: string,
) => void;

function EditableLoadDetailsCard({
  values,
  setValue,
  scheduleSave,
  saveStatus,
  errorMessage,
  lastSavedAt,
}: {
  values: LoadDetailsInitial;
  setValue: ChangeFn;
  scheduleSave: () => void;
  saveStatus: SaveStatus;
  errorMessage: string | null;
  lastSavedAt: Date | null;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/40">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-300">
          Edit load details
        </p>
        <SaveStatusPill
          status={saveStatus}
          errorMessage={errorMessage}
          lastSavedAt={lastSavedAt}
        />
      </header>

      <div className="px-3 py-3 sm:px-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <Subgroup kicker="01 · Shipper">
            <Row
              label="Company"
              fieldKey="pickup_company"
              value={values.pickup_company}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <Row
              label="Address"
              fieldKey="pickup_address"
              value={values.pickup_address}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <CityZipRow
              cityKey="pickup_city_state"
              cityValue={values.pickup_city_state}
              zipKey="pickup_zip"
              zipValue={values.pickup_zip}
              onChange={setValue}
              onBlur={scheduleSave}
              fromQuickQuote
            />
            <Row
              label="Contact"
              fieldKey="pickup_contact"
              value={values.pickup_contact}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <PhoneRow
              label="Phone"
              fieldKey="pickup_phone"
              value={values.pickup_phone}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <DateRangeRow
              label="Window"
              startKey="pickup_window"
              startValue={values.pickup_window}
              endKey="pickup_window_end"
              endValue={values.pickup_window_end}
              onChange={setValue}
              onBlur={scheduleSave}
              startFromQuickQuote
            />
          </Subgroup>

          <Subgroup kicker="02 · Consignee">
            <Row
              label="Company"
              fieldKey="delivery_company"
              value={values.delivery_company}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <Row
              label="Address"
              fieldKey="delivery_address"
              value={values.delivery_address}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <CityZipRow
              cityKey="delivery_city_state"
              cityValue={values.delivery_city_state}
              zipKey="delivery_zip"
              zipValue={values.delivery_zip}
              onChange={setValue}
              onBlur={scheduleSave}
              fromQuickQuote
            />
            <Row
              label="Contact"
              fieldKey="delivery_contact"
              value={values.delivery_contact}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <PhoneRow
              label="Phone"
              fieldKey="delivery_phone"
              value={values.delivery_phone}
              onChange={setValue}
              onBlur={scheduleSave}
            />
            <DateRangeRow
              label="Window"
              startKey="delivery_window"
              startValue={values.delivery_window}
              endKey="delivery_window_end"
              endValue={values.delivery_window_end}
              onChange={setValue}
              onBlur={scheduleSave}
              startFromQuickQuote
            />
          </Subgroup>
        </div>

        <div className="mt-3 lg:mt-4">
          <Subgroup kicker="03 · Freight">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
              <FreightCell
                label="Commodity"
                fieldKey="freight_commodity"
                value={values.freight_commodity}
                onChange={setValue}
                onBlur={scheduleSave}
                fromQuickQuote
              />
              <FreightCell
                label="Weight"
                fieldKey="freight_weight"
                value={values.freight_weight}
                onChange={setValue}
                onBlur={scheduleSave}
                fromQuickQuote
              />
            </div>
          </Subgroup>
        </div>
      </div>
    </section>
  );
}

// Visual subgroup wrapper -- gives Shipper/Consignee/Freight their own
// outlined surface so the three sections stay distinct rather than melting
// into one wall of dark inputs.
function Subgroup({
  kicker,
  children,
}: {
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-900/30">
      <p className="border-b border-zinc-800 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">
        {kicker}
      </p>
      <div className="px-3 py-1">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SaveStatusPill (dark)
// ---------------------------------------------------------------------------

function SaveStatusPill({
  status,
  errorMessage,
  lastSavedAt,
}: {
  status: SaveStatus;
  errorMessage: string | null;
  lastSavedAt: Date | null;
}) {
  if (status === "error") {
    return (
      <span
        className="rounded-sm border border-red-700/70 bg-red-950/30 px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-red-200"
        title={errorMessage ?? "Save failed"}
      >
        Save failed
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-200">
        Saving
      </span>
    );
  }
  if (status === "saved" && lastSavedAt) {
    return (
      <span className="rounded-sm border border-zinc-700 bg-zinc-900 px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-200">
        Saved {formatClockHHMM(lastSavedAt)}
      </span>
    );
  }
  return (
    <span className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
      Auto-save on
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row primitives (dark)
// ---------------------------------------------------------------------------

const ROW_BASE =
  "grid grid-cols-[88px_minmax(0,1fr)_28px] items-center gap-2 border-t border-zinc-800/80 py-1.5";
const ROW_BASE_QQ =
  "grid grid-cols-[88px_minmax(0,1fr)_28px] items-center gap-2 border-t border-zinc-800/80 py-1.5 border-l-[3px] border-l-red-600/80 bg-red-950/25 pl-2";

function LabelWithBar({
  label,
  fromQuickQuote = false,
}: {
  label: string;
  fromQuickQuote?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={
          "inline-block h-[12px] w-[2px] shrink-0 " +
          (fromQuickQuote ? "bg-red-500" : "bg-zinc-600")
        }
      />
      <span
        className={
          "truncate font-mono text-[10px] font-medium uppercase tracking-[0.16em] " +
          (fromQuickQuote ? "text-red-300" : "text-zinc-400")
        }
      >
        {label}
      </span>
    </span>
  );
}

function Row({
  label,
  fieldKey,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  fieldKey: EditableKey;
  value: string;
  onChange: ChangeFn;
  onBlur: () => void;
}) {
  const fromQuickQuote = QUICK_QUOTE_KEYS.has(fieldKey);
  return (
    <div className={fromQuickQuote ? ROW_BASE_QQ : ROW_BASE}>
      <LabelWithBar label={label} fromQuickQuote={fromQuickQuote} />
      <EditableInput
        value={value}
        onChange={(v) => onChange(fieldKey, v)}
        onBlur={onBlur}
        ariaLabel={label}
      />
      <CopyButton value={value} ariaLabel={label} />
    </div>
  );
}

function PhoneRow({
  label,
  fieldKey,
  value,
  onChange,
  onBlur,
}: {
  label: string;
  fieldKey: EditableKey;
  value: string;
  onChange: ChangeFn;
  onBlur: () => void;
}) {
  return (
    <div className={ROW_BASE}>
      <LabelWithBar label={label} />
      <EditableInput
        value={value}
        onChange={(v) => onChange(fieldKey, formatPhoneDisplay(v))}
        onBlur={onBlur}
        ariaLabel={label}
      />
      <CopyButton value={value} ariaLabel={label} />
    </div>
  );
}

function DateRangeRow({
  label,
  startKey,
  startValue,
  endKey,
  endValue,
  onChange,
  onBlur,
  startFromQuickQuote = false,
}: {
  label: string;
  startKey: EditableKey;
  startValue: string;
  endKey: EditableKey;
  endValue: string;
  onChange: ChangeFn;
  onBlur: () => void;
  startFromQuickQuote?: boolean;
}) {
  return (
    <div className={startFromQuickQuote ? ROW_BASE_QQ : ROW_BASE}>
      <LabelWithBar label={label} fromQuickQuote={startFromQuickQuote} />
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] sm:items-center sm:gap-2">
        <EditableInput
          value={startValue}
          onChange={(v) => onChange(startKey, v)}
          onBlur={onBlur}
          ariaLabel={label + " start"}
          type="date"
        />
        <span
          aria-hidden
          className="hidden text-center font-mono text-[12px] text-zinc-600 sm:block"
        >
          {"\u2014"}
        </span>
        <EditableInput
          value={endValue}
          onChange={(v) => onChange(endKey, v)}
          onBlur={onBlur}
          ariaLabel={label + " end"}
          type="date"
        />
      </div>
      <span aria-hidden />
    </div>
  );
}

function FreightCell({
  label,
  fieldKey,
  value,
  onChange,
  onBlur,
  fromQuickQuote = false,
}: {
  label: string;
  fieldKey: EditableKey;
  value: string;
  onChange: ChangeFn;
  onBlur: () => void;
  fromQuickQuote?: boolean;
}) {
  return (
    <div
      className={
        "grid grid-cols-[80px_minmax(0,1fr)_28px] items-center gap-2 py-1.5 " +
        (fromQuickQuote
          ? "border-l-[3px] border-l-red-600/80 bg-red-950/25 pl-2"
          : "")
      }
    >
      <LabelWithBar label={label} fromQuickQuote={fromQuickQuote} />
      <EditableInput
        value={value}
        onChange={(v) => onChange(fieldKey, v)}
        onBlur={onBlur}
        ariaLabel={label}
      />
      <CopyButton value={value} ariaLabel={label} />
    </div>
  );
}

function CityZipRow({
  cityKey,
  cityValue,
  zipKey,
  zipValue,
  onChange,
  onBlur,
  fromQuickQuote = false,
}: {
  cityKey: EditableKey;
  cityValue: string;
  zipKey: EditableKey;
  zipValue: string;
  onChange: ChangeFn;
  onBlur: () => void;
  fromQuickQuote?: boolean;
}) {
  const { city: parsedCity, state: parsedState } = parseCityState(cityValue);
  const combined = [cityValue, zipValue].filter(Boolean).join(" ").trim();

  async function handleZipBlur(z: string) {
    // ZIP onBlur is twofold: (a) trigger the debounced save like every
    // other blur, (b) attempt a server-side city/state lookup. Order:
    // schedule the save first so it runs even if lookup misses; then try
    // lookup and update city_state if it hits, which itself triggers
    // another debounced save with the new city/state.
    onBlur();
    const trimmed = z.trim();
    if (!/^\d{5}$/.test(trimmed)) return;
    const hit = await lookupZipDetails(trimmed);
    if (hit) {
      onChange(cityKey, joinCityState(hit.city, hit.state));
      onBlur();
    }
  }

  return (
    <div className={fromQuickQuote ? ROW_BASE_QQ : ROW_BASE}>
      <LabelWithBar label="City / ZIP" fromQuickQuote={fromQuickQuote} />
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] sm:items-center sm:gap-2">
        <div className="flex items-stretch gap-1.5">
          <div className="min-w-0 flex-1">
            <EditableInput
              value={parsedCity}
              onChange={(v) =>
                onChange(cityKey, joinCityState(v, parsedState))
              }
              onBlur={onBlur}
              ariaLabel="City"
            />
          </div>
          <div className="rounded-sm border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500">
            <select
              value={parsedState}
              onChange={(e) =>
                onChange(cityKey, joinCityState(parsedCity, e.target.value))
              }
              onBlur={onBlur}
              onKeyDown={advanceOnEnter}
              aria-label="State"
              className="block w-[44px] border-0 bg-transparent px-1 py-1.5 text-center font-mono text-[14px] font-medium text-zinc-100 focus:outline-none sm:text-[13.5px]"
            >
              <option value=""></option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="rounded-sm border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500">
          <input
            type="text"
            inputMode="numeric"
            value={zipValue}
            onChange={(e) => onChange(zipKey, e.target.value)}
            onBlur={(e) => void handleZipBlur(e.target.value)}
            onKeyDown={advanceOnEnter}
            aria-label="ZIP code"
            maxLength={5}
            placeholder="ZIP"
            className="block w-full border-0 bg-transparent px-2 py-1.5 font-mono text-[14px] tabular-nums text-zinc-100 placeholder:text-zinc-600 focus:outline-none sm:text-[13.5px]"
          />
        </div>
      </div>
      <CopyButton value={combined} ariaLabel="city and ZIP" />
    </div>
  );
}

function EditableInput({
  value,
  onChange,
  onBlur,
  ariaLabel,
  type,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  ariaLabel: string;
  type?: string;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    advanceOnEnter(e);
  }
  return (
    <div className="flex items-center rounded-sm border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500">
      <input
        type={type ?? "text"}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={handleKey}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1.5 text-[14px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none sm:text-[13.5px]"
      />
    </div>
  );
}

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
      aria-label={copied ? "Copied " + ariaLabel : "Copy " + ariaLabel}
      title={copied ? "Copied" : "Copy"}
      className={
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition-colors " +
        (disabled
          ? "cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-700"
          : copied
            ? "border-zinc-300 bg-zinc-100 text-zinc-900"
            : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100")
      }
    >
      {copied ? (
        <IconCheck className="h-3 w-3" />
      ) : (
        <IconCopy className="h-3 w-3" />
      )}
    </button>
  );
}

// Back-compat alias: OverviewTab (no longer mounted in V4) still
// imports the V4.5 name. Keep the alias so the dead surface compiles
// without forcing an OverviewTab edit in this restyle PR.
export { LaneContextStrip as LaneSummaryCard };
