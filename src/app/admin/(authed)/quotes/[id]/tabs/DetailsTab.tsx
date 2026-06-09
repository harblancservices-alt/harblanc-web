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
 * Level 5 Step 5.9 V4.5 - Details tab.
 *
 * Dispatcher-first IA (V4.5): the operator reads "what is this load?"
 * before "how do I edit it?". The Lane card is the dominant element;
 * Shipper of Record and Freight summarise below. The edit form is
 * collapsed by default - most loads never need an immediate override.
 *
 * Layout (top -> bottom):
 *   1. Customer notes (full width, conditional on non-empty)
 *   2. PRIMARY Lane card (full width)
 *      - Origin city/state/ZIP + pickup window
 *      - Vertical route rail (red dots connected by a 2px line)
 *      - Destination city/state/ZIP + delivery window
 *      - Miles + Map pill in the top-right
 *   3. Secondary row (2-col on desktop, stacked on mobile)
 *      - Shipper of Record (lead contact, read-only)
 *      - Freight summary (Title Case commodity + formatted weight)
 *   4. Edit Load Details (collapsed by default)
 *      - Entire bar is a clickable <button> - operator clicks anywhere
 *        on it to toggle the form open/closed.
 *      - SaveStatusPill lives on the bar so save state stays visible
 *        whether the form is open or closed.
 *      - When expanded: 01 Shipper + 02 Consignee side-by-side on desktop
 *        (lg breakpoint), stacked on mobile; 03 Freight row spans both
 *        columns below.
 *
 * The Lane and Freight summary cards read from LOCAL `values` state
 * (not the `initial` prop) so they update reactively as the operator
 * edits fields inside the edit form. Miles is read from `props.miles`
 * (server-computed) - it does NOT recompute live on ZIP edit; the next
 * page render after save will refresh it.
 *
 * SAVE BEHAVIOR - unchanged from prior version:
 *   - Each input's onBlur schedules a debounced save (~300ms after last
 *     blur). One save in flight at a time; coalesced follow-up.
 *   - The FULL editable form state (all 18 keys) is posted on every save.
 *     The action overwrites the entire JSONB column, so partial posts
 *     would clobber unchanged fields.
 *   - SaveStatusPill: "Saved HH:MM" / "Saving" / "Save failed".
 *
 * UNCHANGED:
 *   - saveLoadDetailsOverrides signature and call site.
 *   - lookupZipDetails behavior on ZIP onBlur.
 *   - LoadDetailsInitial shape.
 *   - EDITABLE_KEYS array and FormData posting.
 *   - intakeSnapshotKey-driven remount pattern at page.tsx.
 *   - PreviewModal, FQ/BOL generation, PDF routes, fingerprints.
 *
 * REMOVED in V4.5:
 *   - Per-section collapse (CollapsibleBanner + IconSectionChevron).
 *     The edit form is now a single bar that opens the entire form;
 *     per-section toggles were redundant once the parent collapses.
 *
 * Risk: MEDIUM (structural rewrite inside a mutation surface; save
 * path preserved verbatim).
 */

// ---------------------------------------------------------------------------
// Constants
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

// Quick Quote-origin fields - red row wash + red label per the operator's
// earlier "highlight which boxes are mandatory from quick quote" request.
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
  /** Shipper of Record (lead contact) - read-only, lifted from OperatorHeader. */
  shipperOfRecord: { name: string; phone: string; email: string };
  /** Server-computed route miles for the Lane card. Null if unroutable. */
  miles: number | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

// ---------------------------------------------------------------------------
// Helpers
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
  return `${c}, ${s}`;
}

function formatClockHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// V4.5 display helpers - used by LaneSummaryCard + FreightSummaryCard.

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
  // Operator already typed a unit (e.g. "8000 lbs", "4 tons") - leave it.
  if (/[a-zA-Z]/.test(trimmed)) return trimmed;
  // Otherwise treat as a number and append "lbs" (canonical intake unit).
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 0) return trimmed;
  const n = Number(digits);
  if (!Number.isFinite(n)) return trimmed;
  return `${n.toLocaleString("en-US")} lbs`;
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  // <input type="date"> emits YYYY-MM-DD; render as MM/DD/YYYY for humans.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function formatWindow(start: string, end: string): string | null {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return null;
  if (s && e) return `${formatDateDisplay(s)} — ${formatDateDisplay(e)}`;
  return formatDateDisplay(s || e);
}

// ---------------------------------------------------------------------------
// Debounced save hook (unchanged)
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

    // Build FormData fresh from the latest values ref. The action overwrites
    // the entire JSONB column, so we MUST post the full editable state - not
    // just the field that triggered the save - or unchanged fields get
    // clobbered.
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
// DetailsTab (V4.5 layout)
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

  const { scheduleSave } = useDebouncedSave(quoteRequestId, valuesRef);

  const setValue = useCallback(
    <K extends keyof LoadDetailsInitial>(key: K, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <div className="space-y-3 px-4 pt-4 pb-6 sm:space-y-4 sm:px-6 lg:px-8">
      <LaneSummaryCard values={values} miles={miles} />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[1.4fr_1fr]">
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
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LaneSummaryCard (NEW V4.5) - primary, full-width, dominant element
// ---------------------------------------------------------------------------

export function LaneSummaryCard({
  values,
  miles,
}: {
  values: LoadDetailsInitial;
  miles: number | null;
}) {
  const pickupZip = values.pickup_zip.trim();
  const deliveryZip = values.delivery_zip.trim();
  const pickupCityState = values.pickup_city_state.trim();
  const deliveryCityState = values.delivery_city_state.trim();
  const pickupPlace = [pickupCityState, pickupZip].filter(Boolean).join(" ");
  const deliveryPlace = [deliveryCityState, deliveryZip].filter(Boolean).join(" ");
  const pickupWindow = formatWindow(values.pickup_window, values.pickup_window_end);
  const deliveryWindow = formatWindow(values.delivery_window, values.delivery_window_end);
  // mapHref is derived locally so the pill stays in sync with edits the
  // operator just made; miles comes from the server-computed prop.
  const mapHref =
    pickupZip && deliveryZip
      ? `https://maps.apple.com/?saddr=${encodeURIComponent(pickupZip)}&daddr=${encodeURIComponent(deliveryZip)}&dirflg=d`
      : null;

  return (
    <section
      aria-label="Lane"
      className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6] px-5 py-5 sm:px-6 sm:py-6 lg:py-7"
    >
      {mapHref ? (
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open route in Maps"
          className="flex w-full items-center justify-center border-2 border-black bg-white px-4 py-3 font-mono text-[14px] font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-[#f3f1e9] sm:text-[15px]"
        >
          Open route in Maps
        </a>
      ) : null}

      <div className="mt-3 flex gap-3 sm:gap-4">
        <div className="flex flex-col items-center" aria-hidden>
          <div className="mt-1.5 h-3 w-3 rounded-full bg-black" />
          <div className="my-1 w-[2px] flex-1 bg-black" />
          <div className="mb-1.5 h-3 w-3 rounded-full bg-black" />
        </div>
        <div className="min-w-0 flex-1 space-y-5">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black">
              Origin
            </p>
            <p className="mt-1 text-[20px] font-bold leading-tight text-black sm:text-[26px] lg:text-[30px]">
              {pickupPlace || "—"}
            </p>
            {pickupWindow ? (
              <p className="mt-2 font-mono text-[12px] font-bold text-red-700 sm:text-[13px]">
                <span className="mr-2 uppercase tracking-[0.18em] text-red-700">
                  Pickup
                </span>
                {pickupWindow}
              </p>
            ) : (
              <p className="mt-2 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-red-700">
                Pickup window not set
              </p>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-black">
              Destination
            </p>
            <p className="mt-1 text-[20px] font-bold leading-tight text-black sm:text-[26px] lg:text-[30px]">
              {deliveryPlace || "—"}
            </p>
            {deliveryWindow ? (
              <p className="mt-2 font-mono text-[12px] font-bold text-red-700 sm:text-[13px]">
                <span className="mr-2 uppercase tracking-[0.18em] text-red-700">
                  Delivery
                </span>
                {deliveryWindow}
              </p>
            ) : (
              <p className="mt-2 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-red-700">
                Delivery window not set
              </p>
            )}
            {miles != null ? (
              <div className="mt-3 flex justify-end">
                <span className="inline-flex items-center border-2 border-black bg-white px-4 py-2 font-mono text-[14px] font-bold uppercase tabular-nums tracking-[0.18em] text-red-700 sm:text-[15px]">
                  Miles : {miles.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shipper of Record (read-only, lifted from OperatorHeader)
// ---------------------------------------------------------------------------

function ShipperOfRecordCard({
  contact,
}: {
  contact: { name: string; phone: string; email: string };
}) {
  const phoneHref = `tel:${contact.phone.replace(/[^\d+]/g, "")}`;
  const mailHref = `mailto:${contact.email}`;
  return (
    <section className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]">
      <p className="px-3 pt-3 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black sm:px-4 sm:pt-4">
        Shipper of record
      </p>
      <ContactRow label="Customer" value={contact.name} ariaLabel="customer name" />
      <ContactRow
        label="Phone"
        value={formatPhoneDisplay(contact.phone) || contact.phone}
        mono
        actionHref={phoneHref}
        actionLabel="Tap to call"
        ariaLabel="phone"
        dashed
      />
      <ContactRow
        label="Email"
        value={contact.email}
        mono
        actionHref={mailHref}
        actionLabel="Draft email"
        ariaLabel="email"
        dashed
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
  dashed,
}: {
  label: string;
  value: string;
  mono?: boolean;
  actionHref?: string;
  actionLabel?: string;
  ariaLabel: string;
  dashed?: boolean;
}) {
  const valueCls =
    "text-[16px] text-black truncate " + (mono ? "font-mono " : "");

  const inner = (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="w-[80px] shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-black">
        {label}
      </div>
      <div className="min-w-0 flex-1">
        <p className={valueCls}>{value}</p>
      </div>
    </div>
  );

  return (
    <div
      className={
        "flex items-stretch " +
        (dashed ? "border-t border-dashed border-black/15" : "")
      }
    >
      {actionHref ? (
        <a
          href={actionHref}
          className="flex min-w-0 flex-1 transition-colors hover:bg-[#f3f1e9]"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
      <div className="flex shrink-0 items-center gap-2 pr-3 sm:pr-4">
        {actionHref && actionLabel ? (
          <a
            href={actionHref}
            className="hidden font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-black hover:underline sm:inline-block"
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
// FreightSummaryCard (NEW V4.5)
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
      aria-label="Freight"
      className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]"
    >
      <p className="px-4 pt-3 pb-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black sm:px-5 sm:pt-4">
        Freight
      </p>
      <div className="px-4 pb-4 sm:px-5">
        {hasAny ? (
          <>
            {display.length > 0 ? (
              <p className="text-[20px] font-bold leading-tight text-black sm:text-[22px]">
                {display}
              </p>
            ) : null}
            {wt.length > 0 ? (
              <p
                className={
                  "font-mono text-[13px] font-bold text-black sm:text-[14px] " +
                  (display.length > 0 ? "mt-1.5" : "")
                }
              >
                {wt}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[14px] text-black">&mdash;</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editable load details card (V4.5: collapsed by default, full-bar click)
// ---------------------------------------------------------------------------

type ChangeFn = <K extends keyof LoadDetailsInitial>(
  key: K,
  value: string,
) => void;

function EditableLoadDetailsCard({
  values,
  setValue,
  scheduleSave,
}: {
  values: LoadDetailsInitial;
  setValue: ChangeFn;
  scheduleSave: () => void;
}) {
  return (
    <section className="border-2 border-black border-l-4 border-l-black bg-[#fafaf6]">
      <p className="px-4 pt-4 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-black sm:px-5">
        Edit load details
      </p>

      <div className="px-4 pb-5 sm:px-5">
          <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {/* 01 Shipper */}
            <div>
              <p className="pb-1 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
                01 &middot; Shipper
              </p>
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
            </div>

            {/* 02 Consignee */}
            <div className="mt-5 lg:mt-0">
              <p className="pb-1 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
                02 &middot; Consignee
              </p>
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
            </div>
          </div>

          {/* 03 Freight - spans both columns */}
          <div className="mt-5 border-t border-black/15 pt-4">
            <p className="pb-2 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
              03 &middot; Freight
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </div>
        </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Save status pill (now lives on the Edit bar)
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
        className="border border-black bg-[#f3f1e9] px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black"
        title={errorMessage ?? "Save failed"}
      >
        Save failed
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="border border-black bg-white px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
        Saving
      </span>
    );
  }
  if (status === "saved" && lastSavedAt) {
    return (
      <span className="border border-black bg-white px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
        Saved {formatClockHHMM(lastSavedAt)}
      </span>
    );
  }
  return (
    <span className="border border-black bg-white px-2.5 py-1 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-black">
      Auto-save on
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives (unchanged behavior; horizontal padding shifted so the
// rows fit inside the new edit-form body wrapper which already supplies
// horizontal padding).
// ---------------------------------------------------------------------------

function LabelWithBar({
  label,
  fromQuickQuote = false,
}: {
  label: string;
  fromQuickQuote?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="inline-block h-[14px] w-[3px] shrink-0 bg-black" />
      <span
        className={
          "truncate font-mono text-[12px] font-bold uppercase tracking-[0.14em] " +
          (fromQuickQuote ? "text-black" : "text-black")
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
    <div
      className={
        "grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-black/15 py-2 " +
        (fromQuickQuote ? "-mx-2 border-l-[3px] border-l-black bg-[#f3f1e9] px-2" : "")
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
    <div className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-black/15 py-2">
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
    <div
      className={
        "grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-black/15 py-2 " +
        (startFromQuickQuote ? "-mx-2 border-l-[5px] border-l-red-700 px-2" : "")
      }
      style={startFromQuickQuote ? { backgroundColor: "#fca5a5" } : undefined}
    >
      <LabelWithBar label={label} fromQuickQuote={startFromQuickQuote} />
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_14px_minmax(0,1fr)] sm:items-center sm:gap-2">
        <EditableInput
          value={startValue}
          onChange={(v) => onChange(startKey, v)}
          onBlur={onBlur}
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
          onBlur={onBlur}
          ariaLabel={`${label} end`}
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
        "grid grid-cols-[90px_minmax(0,1fr)_28px] items-center gap-2 " +
        (fromQuickQuote ? "-mx-2 border-l-[5px] border-l-red-700 px-2 py-1.5" : "")
      }
      style={fromQuickQuote ? { backgroundColor: "#fca5a5" } : undefined}
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
    // ZIP onBlur is twofold: (a) trigger the debounced save like every other
    // blur, (b) attempt a server-side city/state lookup. Order: schedule the
    // save first so it runs even if lookup misses; then try lookup and
    // update city_state if it hits, which itself triggers another debounced
    // save with the new city/state.
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
    <div
      className={
        "grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 border-t border-black/15 py-2 " +
        (fromQuickQuote ? "-mx-2 border-l-[5px] border-l-red-700 px-2" : "")
      }
      style={fromQuickQuote ? { backgroundColor: "#fca5a5" } : undefined}
    >
      <LabelWithBar label="City / ZIP" fromQuickQuote={fromQuickQuote} />
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-center sm:gap-2">
        <div className="flex items-stretch gap-1.5">
          <div className="min-w-0 flex-1">
            <EditableInput
              value={parsedCity}
              onChange={(v) => onChange(cityKey, joinCityState(v, parsedState))}
              onBlur={onBlur}
              ariaLabel="City"
            />
          </div>
          <div className="border border-black bg-white focus-within:border-black">
            <select
              value={parsedState}
              onChange={(e) =>
                onChange(cityKey, joinCityState(parsedCity, e.target.value))
              }
              onBlur={onBlur}
              onKeyDown={advanceOnEnter}
              aria-label="State"
              className="block w-[58px] border-0 bg-transparent px-1.5 py-1.5 text-center font-mono text-[16px] font-medium text-black focus:outline-none sm:text-[15px]"
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
        <div className="border border-black bg-white focus-within:border-black">
          <input
            type="text"
            inputMode="numeric"
            value={zipValue}
            onChange={(e) => onChange(zipKey, e.target.value)}
            onBlur={(e) => void handleZipBlur(e.target.value)}
            onKeyDown={advanceOnEnter}
            aria-label="ZIP code"
            maxLength={5}
            className="block w-full border-0 bg-transparent px-2.5 py-1.5 text-[16px] text-black placeholder:text-black focus:outline-none sm:text-[15px]"
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
    <div className="flex items-center border border-black bg-white focus-within:border-black">
      <input
        type={type ?? "text"}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        onKeyDown={handleKey}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-0 bg-transparent px-2.5 py-1.5 text-[16px] text-black placeholder:text-black focus:outline-none sm:text-[15px]"
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
      aria-label={copied ? `Copied ${ariaLabel}` : `Copy ${ariaLabel}`}
      title={copied ? "Copied" : "Copy"}
      className={
        "inline-flex h-7 w-7 shrink-0 items-center justify-center border transition-colors " +
        (disabled
          ? "cursor-not-allowed border-black/30 bg-white text-black"
          : copied
            ? "border-black bg-black text-white"
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
