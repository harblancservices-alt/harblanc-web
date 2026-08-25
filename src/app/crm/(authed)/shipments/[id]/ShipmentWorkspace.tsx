"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, BTN_PRIMARY, BTN_EDIT } from "../../_shell/ui";
import { FormError } from "../../_shell/form";
import { AsyncSearchPicker } from "../../_shell/AsyncSearchPicker";
import { formatDate, titleCaseWords, formatPhone, formatStateCase, stripCommas } from "../../_shell/format";
import { IconChevronDown } from "../../_shell/icons";
import { TextRow, TextAreaRow, MoneyRow, SelectRow, FormRow2, SelectedEntityChip } from "./fields";
import { LocationPickerModal } from "./LocationPickerModal";
import { CarrierFormDialog } from "../../carriers/CarrierFormDialog";
import { updateShipment, searchCustomers, createAccountLocation, softDeleteShipment } from "../actions";
import { listCarriers, getCarrier } from "../carriers-actions";
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL, shipmentStatusTone } from "../statusMeta";
import { EQUIPMENT_TYPES } from "../equipmentType";
import type {
  CrmAccountLocation,
  CrmCarrier,
  CrmCarrierContact,
  CrmShipmentDetail,
  CustomerSearchResult,
  ShipmentFields,
} from "../types";

function str(v: string | null | undefined): string {
  return v ?? "";
}
function orNull(v: string): string | null {
  const t = v.trim();
  return t || null;
}

/**
 * Postgres `time` comes back as "HH:MM:SS"; <input type="time"> wants
 * "HH:MM". Trims to the minute in both directions — seconds are never
 * meaningful for a dock appointment.
 */
function hhmm(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{2}):(\d{2})/.exec(v.trim());
  return m ? `${m[1]}:${m[2]}` : "";
}

/**
 * Read-only summary of a LEGACY stop — a shipment created before the timing
 * model, whose new columns are all NULL. Renders what is actually stored,
 * without reinterpreting it: a degenerate window like "08:00 - 08:00" is
 * shown verbatim rather than being guessed into an appointment, because the
 * original intent is unknowable. Editing the stop with the new controls above
 * is what supersedes this line.
 */
function legacyStopSummary(at: string | null, window: string | null): string | null {
  const parts: string[] = [];
  if (at) parts.push(formatDate(at));
  if (window?.trim()) parts.push(`window ${window.trim()}`);
  return parts.length ? parts.join(" · ") : null;
}
function moneyOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

type LocalState = {
  accountId: string;
  customerName: string;
  shipperLocationId: string;
  shipperName: string;
  shipperAddress: string;
  shipperCity: string;
  shipperState: string;
  shipperZip: string;
  shipperContact: string;
  shipperPhone: string;
  consigneeLocationId: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneeCity: string;
  consigneeState: string;
  consigneeZip: string;
  consigneeContact: string;
  consigneePhone: string;
  pickupDate: string;
  pickupTimingMode: string;
  pickupAppointmentTime: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  pickupNumber: string;
  pickupNotes: string;
  deliveryDate: string;
  deliveryTimingMode: string;
  deliveryAppointmentTime: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  deliveryNumber: string;
  deliveryNotes: string;
  commodity: string;
  description: string;
  weight: string;
  pieces: string;
  equipment: string;
  poNumber: string;
  refNumbers: string;
  specialInstructions: string;
  carrierRate: string;
  carrierContactId: string;
  notes: string;
};

const SHIPPER_AUTOFILL_KEYS = [
  "shipperName",
  "shipperAddress",
  "shipperCity",
  "shipperState",
  "shipperZip",
  "shipperContact",
  "shipperPhone",
] as const satisfies readonly (keyof LocalState)[];

const CONSIGNEE_AUTOFILL_KEYS = [
  "consigneeName",
  "consigneeAddress",
  "consigneeCity",
  "consigneeState",
  "consigneeZip",
  "consigneeContact",
  "consigneePhone",
] as const satisfies readonly (keyof LocalState)[];

type AutoFill = { source: string; fields: Set<keyof LocalState> } | null;

function toLocal(shipment: CrmShipmentDetail): LocalState {
  return {
    accountId: str(shipment.accountId),
    customerName: str(shipment.customerName),
    shipperLocationId: str(shipment.shipperLocationId),
    shipperName: str(shipment.shipperName),
    shipperAddress: str(shipment.shipperAddress),
    shipperCity: str(shipment.shipperCity),
    shipperState: str(shipment.shipperState),
    shipperZip: str(shipment.shipperZip),
    shipperContact: str(shipment.shipperContact),
    shipperPhone: str(shipment.shipperPhone),
    consigneeLocationId: str(shipment.consigneeLocationId),
    consigneeName: str(shipment.consigneeName),
    consigneeAddress: str(shipment.consigneeAddress),
    consigneeCity: str(shipment.consigneeCity),
    consigneeState: str(shipment.consigneeState),
    consigneeZip: str(shipment.consigneeZip),
    consigneeContact: str(shipment.consigneeContact),
    consigneePhone: str(shipment.consigneePhone),
    pickupDate: str(shipment.pickupDate),
    pickupTimingMode: str(shipment.pickupTimingMode),
    pickupAppointmentTime: hhmm(shipment.pickupAppointmentTime),
    pickupWindowStart: hhmm(shipment.pickupWindowStart),
    pickupWindowEnd: hhmm(shipment.pickupWindowEnd),
    pickupNumber: str(shipment.pickupNumber),
    pickupNotes: str(shipment.pickupNotes),
    deliveryDate: str(shipment.deliveryDate),
    deliveryTimingMode: str(shipment.deliveryTimingMode),
    deliveryAppointmentTime: hhmm(shipment.deliveryAppointmentTime),
    deliveryWindowStart: hhmm(shipment.deliveryWindowStart),
    deliveryWindowEnd: hhmm(shipment.deliveryWindowEnd),
    deliveryNumber: str(shipment.deliveryNumber),
    deliveryNotes: str(shipment.deliveryNotes),
    commodity: str(shipment.commodity),
    description: str(shipment.description),
    weight: str(shipment.weight),
    pieces: str(shipment.pieces),
    equipment: str(shipment.equipment),
    poNumber: str(shipment.poNumber),
    refNumbers: str(shipment.refNumbers),
    specialInstructions: str(shipment.specialInstructions),
    carrierRate: shipment.carrierRate != null ? String(shipment.carrierRate) : "",
    carrierContactId: str(shipment.carrierContactId),
    notes: str(shipment.notes),
  };
}

/**
 * The shipment operational editor — Customer / Carrier / Freight / Notes /
 * Shipper / Consignee / Pickup / Delivery sections, alternating left/right
 * on desktop, each field autosaved on blur (or immediately for pickers/
 * selects) via updateShipment. No Customer Rate field here (2026-08-09,
 * dropped from the workspace entirely) and no Create RC/BOL buttons — those
 * live at the bottom of the Documents section now (DocumentsSection.tsx),
 * which opens them as modals instead of navigating to a separate route.
 * Every picker (customer, shipper/consignee location, carrier) only ever
 * FILLS fields — nothing is ever locked, and every selected entity carries
 * a small square blue Change (reopen the picker to swap) / Reset (detach the
 * id link AND blank whatever it filled) button, compact style 2026-08-09.
 */
const SECTIONS = [
  { id: "customer", title: "Customer" },
  { id: "carrier", title: "Carrier" },
  { id: "freight", title: "Freight" },
  { id: "notes", title: "Notes" },
  { id: "shipper", title: "Shipper" },
  { id: "consignee", title: "Consignee" },
  { id: "pickup", title: "Pickup" },
  { id: "delivery", title: "Delivery" },
] as const;

export function ShipmentWorkspace({ shipment }: { shipment: CrmShipmentDetail }) {
  const router = useRouter();
  const [state, setState] = useState<LocalState>(() => toLocal(shipment));
  const [status, setStatus] = useState(shipment.status);
  const [carrier, setCarrier] = useState<CrmCarrier | null>(shipment.carrier);
  const [shipperAutoFill, setShipperAutoFill] = useState<AutoFill>(null);
  const [consigneeAutoFill, setConsigneeAutoFill] = useState<AutoFill>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [carrierPickerOpen, setCarrierPickerOpen] = useState(false);
  const [carrierContacts, setCarrierContacts] = useState<CrmCarrierContact[]>([]);
  const [carrierAutoFillSource, setCarrierAutoFillSource] = useState<string | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startSaveTransition] = useTransition();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  // ── Section collapse state (mobile-only default) ──────────────────────
  // Every section starts open — matching today's `<details open>` on every
  // breakpoint, so SSR/first paint is unchanged everywhere, including
  // desktop. Only after mount, and only below `lg`, do we collapse down to
  // just the first section — desktop never runs this branch, so its
  // "everything expanded" layout never changes.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, true])),
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    setOpenSections(Object.fromEntries(SECTIONS.map((s, i) => [s.id, i === 0])));
  }, []);

  // Load the assigned carrier's contact roster once on mount (if a carrier
  // is already set) so the Carrier Contact dropdown has options to show for
  // an existing shipment, not just one just picked in this session.
  useEffect(() => {
    if (!shipment.carrierId) return;
    getCarrier(shipment.carrierId).then((c) => setCarrierContacts(c?.contacts ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function jumpToSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function sectionProps(id: string) {
    return {
      id,
      open: openSections[id],
      onToggle: (o: boolean) => setOpenSections((prev) => ({ ...prev, [id]: o })),
    };
  }

  function set<K extends keyof LocalState>(key: K, value: LocalState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  // ── Stop timing ────────────────────────────────────────────────────────
  // One writer for both stops. Always sends the stop's FIVE keys together so
  // the mode and its clock columns move as a single unit — that is what makes
  // "switching mode clears the other mode's values" true in the database and
  // not just on screen. The DB CHECK constraints
  // (crm_shipments_*_timing_shape_check) are the final backstop.
  //
  // An incomplete state is held locally and simply not written: a window with
  // only a start, or an end that is not after the start, never reaches the
  // server. That is the client half of the validation; the constraint is the
  // other half.
  type TimingLocal = {
    date: string;
    mode: string;
    appointmentTime: string;
    windowStart: string;
    windowEnd: string;
  };

  function timingOf(stop: "pickup" | "delivery", overrides: Partial<TimingLocal> = {}): TimingLocal {
    const base: TimingLocal =
      stop === "pickup"
        ? {
            date: state.pickupDate,
            mode: state.pickupTimingMode,
            appointmentTime: state.pickupAppointmentTime,
            windowStart: state.pickupWindowStart,
            windowEnd: state.pickupWindowEnd,
          }
        : {
            date: state.deliveryDate,
            mode: state.deliveryTimingMode,
            appointmentTime: state.deliveryAppointmentTime,
            windowStart: state.deliveryWindowStart,
            windowEnd: state.deliveryWindowEnd,
          };
    return { ...base, ...overrides };
  }

  /** null = this local state is not yet a valid, writable timing set. */
  function buildTimingFields(stop: "pickup" | "delivery", t: TimingLocal): Partial<ShipmentFields> | null {
    const date = orNull(t.date);
    const P = stop === "pickup";

    // No date -> no timing at all. Clears the whole stop rather than leaving a
    // mode stranded without a day (which the DB would reject anyway).
    if (!date) {
      return P
        ? { pickupDate: null, pickupTimingMode: null, pickupAppointmentTime: null, pickupWindowStart: null, pickupWindowEnd: null }
        : { deliveryDate: null, deliveryTimingMode: null, deliveryAppointmentTime: null, deliveryWindowStart: null, deliveryWindowEnd: null };
    }

    // Date chosen but no mode yet — a legitimate mid-entry state.
    if (!t.mode) {
      return P
        ? { pickupDate: date, pickupTimingMode: null, pickupAppointmentTime: null, pickupWindowStart: null, pickupWindowEnd: null }
        : { deliveryDate: date, deliveryTimingMode: null, deliveryAppointmentTime: null, deliveryWindowStart: null, deliveryWindowEnd: null };
    }

    if (t.mode === "tbd") {
      return P
        ? { pickupDate: date, pickupTimingMode: "tbd", pickupAppointmentTime: null, pickupWindowStart: null, pickupWindowEnd: null }
        : { deliveryDate: date, deliveryTimingMode: "tbd", deliveryAppointmentTime: null, deliveryWindowStart: null, deliveryWindowEnd: null };
    }

    if (t.mode === "appointment") {
      const appt = orNull(t.appointmentTime);
      if (!appt) return null; // incomplete — hold, don't write
      return P
        ? { pickupDate: date, pickupTimingMode: "appointment", pickupAppointmentTime: appt, pickupWindowStart: null, pickupWindowEnd: null }
        : { deliveryDate: date, deliveryTimingMode: "appointment", deliveryAppointmentTime: appt, deliveryWindowStart: null, deliveryWindowEnd: null };
    }

    // window
    const startT = orNull(t.windowStart);
    const endT = orNull(t.windowEnd);
    if (!startT || !endT) return null;      // both bounds required
    if (endT <= startT) return null;        // strictly later; blocks 08:00-08:00
    return P
      ? { pickupDate: date, pickupTimingMode: "window", pickupAppointmentTime: null, pickupWindowStart: startT, pickupWindowEnd: endT }
      : { deliveryDate: date, deliveryTimingMode: "window", deliveryAppointmentTime: null, deliveryWindowStart: startT, deliveryWindowEnd: endT };
  }

  function commitTiming(stop: "pickup" | "delivery", overrides: Partial<TimingLocal> = {}) {
    const fields = buildTimingFields(stop, timingOf(stop, overrides));
    if (fields) commit(fields);
  }

  /** Mode switch: update local state AND clear the outgoing mode's inputs in
   * the same tick, so nothing stale lingers on screen either. */
  function setTimingMode(stop: "pickup" | "delivery", mode: string) {
    const cleared = { mode, appointmentTime: "", windowStart: "", windowEnd: "" };
    if (stop === "pickup") {
      setState((prev) => ({
        ...prev,
        pickupTimingMode: mode,
        pickupAppointmentTime: "",
        pickupWindowStart: "",
        pickupWindowEnd: "",
      }));
    } else {
      setState((prev) => ({
        ...prev,
        deliveryTimingMode: mode,
        deliveryAppointmentTime: "",
        deliveryWindowStart: "",
        deliveryWindowEnd: "",
      }));
    }
    // 'tbd' (and a cleared mode) are complete on their own, so they persist
    // immediately. 'window'/'appointment' need their times first.
    commitTiming(stop, cleared);
  }

  const pickupLegacy =
    !shipment.pickupTimingMode && !state.pickupDate
      ? legacyStopSummary(shipment.pickupAt, shipment.pickupWindow)
      : null;
  const deliveryLegacy =
    !shipment.deliveryTimingMode && !state.deliveryDate
      ? legacyStopSummary(shipment.deliveryAt, shipment.deliveryWindow)
      : null;

  function untrack(setter: (updater: (prev: AutoFill) => AutoFill) => void, key: keyof LocalState) {
    setter((prev) => {
      if (!prev || !prev.fields.has(key)) return prev;
      const fields = new Set(prev.fields);
      fields.delete(key);
      return fields.size ? { ...prev, fields } : null;
    });
  }

  function setShipperField<K extends keyof LocalState>(key: K, value: LocalState[K]) {
    set(key, value);
    untrack(setShipperAutoFill, key);
  }

  function setConsigneeField<K extends keyof LocalState>(key: K, value: LocalState[K]) {
    set(key, value);
    untrack(setConsigneeAutoFill, key);
  }

  function commit(fields: Partial<ShipmentFields>) {
    startSaveTransition(async () => {
      const result = await updateShipment(shipment.id, fields);
      setSaveError(result.ok ? null : result.error);
    });
  }

  // ── Customer ────────────────────────────────────────────────────────────

  function selectCustomer(c: CustomerSearchResult) {
    setCustomerPickerOpen(false);
    setState((prev) => ({ ...prev, accountId: c.id, customerName: c.name }));
    commit({ accountId: c.id, customerName: c.name });
  }

  function resetCustomer() {
    setCustomerPickerOpen(false);
    setState((prev) => ({ ...prev, accountId: "", customerName: "" }));
    commit({ accountId: null, customerName: null });
  }

  // ── Shipper / Consignee locations ──────────────────────────────────────

  function fillFromLocation(
    side: "shipper" | "consignee",
    loc: CrmAccountLocation,
  ) {
    const name = loc.label || state.customerName;
    const patch =
      side === "shipper"
        ? {
            shipperLocationId: loc.id,
            shipperName: name,
            shipperAddress: str(loc.address),
            shipperCity: str(loc.city),
            shipperState: str(loc.state),
            shipperZip: str(loc.zip),
            shipperContact: str(loc.contactName),
            shipperPhone: str(loc.contactPhone),
          }
        : {
            consigneeLocationId: loc.id,
            consigneeName: name,
            consigneeAddress: str(loc.address),
            consigneeCity: str(loc.city),
            consigneeState: str(loc.state),
            consigneeZip: str(loc.zip),
            consigneeContact: str(loc.contactName),
            consigneePhone: str(loc.contactPhone),
          };
    setState((prev) => ({ ...prev, ...patch }));
    const keys = side === "shipper" ? SHIPPER_AUTOFILL_KEYS : CONSIGNEE_AUTOFILL_KEYS;
    const setter = side === "shipper" ? setShipperAutoFill : setConsigneeAutoFill;
    setter({ source: loc.label || "saved location", fields: new Set(keys) });
    commit(
      side === "shipper"
        ? {
            shipperLocationId: loc.id,
            shipperName: name || null,
            shipperAddress: orNull(str(loc.address)),
            shipperCity: orNull(str(loc.city)),
            shipperState: orNull(str(loc.state)),
            shipperZip: orNull(str(loc.zip)),
            shipperContact: orNull(str(loc.contactName)),
            shipperPhone: orNull(str(loc.contactPhone)),
          }
        : {
            consigneeLocationId: loc.id,
            consigneeName: name || null,
            consigneeAddress: orNull(str(loc.address)),
            consigneeCity: orNull(str(loc.city)),
            consigneeState: orNull(str(loc.state)),
            consigneeZip: orNull(str(loc.zip)),
            consigneeContact: orNull(str(loc.contactName)),
            consigneePhone: orNull(str(loc.contactPhone)),
          },
    );

    // Recurring carrier suggestion: a location can name a carrier/contact
    // it's normally booked with (crm_account_locations.default_carrier_id).
    // Only offer it when no carrier is assigned yet — never clobber a
    // carrier the user already picked or that came with the shipment.
    if (loc.defaultCarrierId && !carrier) {
      startSaveTransition(async () => {
        const full = await getCarrier(loc.defaultCarrierId as string);
        if (!full) return;
        setCarrier(full);
        setCarrierContacts(full.contacts);
        const contact = loc.defaultCarrierContactId
          ? full.contacts.find((c) => c.id === loc.defaultCarrierContactId)
          : undefined;
        setState((prev) => ({ ...prev, carrierContactId: contact?.id ?? "" }));
        setCarrierAutoFillSource(loc.label || "saved location");
        commit({
          carrierId: full.id,
          carrierContactId: contact?.id ?? null,
          carrierContactName: contact?.name ?? null,
          carrierContactPhone: contact?.phone ?? full.phone ?? null,
          carrierContactEmail: contact?.email ?? full.email ?? null,
        });
      });
    }
  }

  function resetLocation(side: "shipper" | "consignee") {
    if (side === "shipper") {
      setState((prev) => ({
        ...prev,
        shipperLocationId: "",
        shipperName: "",
        shipperAddress: "",
        shipperCity: "",
        shipperState: "",
        shipperZip: "",
      }));
      setShipperAutoFill(null);
      commit({
        shipperLocationId: null,
        shipperName: null,
        shipperAddress: null,
        shipperCity: null,
        shipperState: null,
        shipperZip: null,
      });
    } else {
      setState((prev) => ({
        ...prev,
        consigneeLocationId: "",
        consigneeName: "",
        consigneeAddress: "",
        consigneeCity: "",
        consigneeState: "",
        consigneeZip: "",
      }));
      setConsigneeAutoFill(null);
      commit({
        consigneeLocationId: null,
        consigneeName: null,
        consigneeAddress: null,
        consigneeCity: null,
        consigneeState: null,
        consigneeZip: null,
      });
    }
  }

  const [savingLocation, setSavingLocation] = useState<"shipper" | "consignee" | null>(null);
  const [locationSaveError, setLocationSaveError] = useState<string | null>(null);

  function saveAsNewLocation(side: "shipper" | "consignee") {
    if (!state.accountId) return;
    setSavingLocation(side);
    setLocationSaveError(null);
    startSaveTransition(async () => {
      const fields =
        side === "shipper"
          ? {
              label: orNull(state.shipperName),
              address: orNull(state.shipperAddress),
              city: orNull(state.shipperCity),
              state: orNull(state.shipperState),
              zip: orNull(state.shipperZip),
            }
          : {
              label: orNull(state.consigneeName),
              address: orNull(state.consigneeAddress),
              city: orNull(state.consigneeCity),
              state: orNull(state.consigneeState),
              zip: orNull(state.consigneeZip),
            };
      const result = await createAccountLocation(state.accountId, fields);
      setSavingLocation(null);
      if (!result.ok) {
        setLocationSaveError(result.error);
        return;
      }
      if (side === "shipper") {
        setState((prev) => ({ ...prev, shipperLocationId: result.id }));
        commit({ shipperLocationId: result.id });
      } else {
        setState((prev) => ({ ...prev, consigneeLocationId: result.id }));
        commit({ consigneeLocationId: result.id });
      }
    });
  }

  // ── Carrier ─────────────────────────────────────────────────────────────

  function selectCarrier(c: CrmCarrier) {
    setCarrierPickerOpen(false);
    setCarrier(c);
    setCarrierContacts([]);
    setCarrierAutoFillSource(null);
    setState((prev) => ({ ...prev, carrierContactId: "" }));
    commit({ carrierId: c.id, carrierContactId: null, carrierContactName: null, carrierContactPhone: null, carrierContactEmail: null });
    startSaveTransition(async () => {
      const full = await getCarrier(c.id);
      setCarrierContacts(full?.contacts ?? []);
    });
  }

  function resetCarrier() {
    setCarrierPickerOpen(false);
    setCarrier(null);
    setCarrierContacts([]);
    setCarrierAutoFillSource(null);
    setState((prev) => ({ ...prev, carrierContactId: "" }));
    commit({ carrierId: null, carrierContactId: null, carrierContactName: null, carrierContactPhone: null, carrierContactEmail: null });
  }

  function selectCarrierContact(contactId: string) {
    setCarrierAutoFillSource(null);
    setState((prev) => ({ ...prev, carrierContactId: contactId }));
    const contact = carrierContacts.find((c) => c.id === contactId);
    commit({
      carrierContactId: contactId || null,
      carrierContactName: contact?.name ?? null,
      carrierContactPhone: contact?.phone ?? carrier?.phone ?? null,
      carrierContactEmail: contact?.email ?? carrier?.email ?? null,
    });
  }

  // ── Status ──────────────────────────────────────────────────────────────

  function changeStatus(v: string) {
    setStatus(v);
    commit({ status: v });
  }

  function changeEquipment(v: string) {
    set("equipment", v);
    commit({ equipment: orNull(v) });
  }

  function onDeleteShipment() {
    if (!window.confirm(`Delete shipment ${shipment.shipmentNumber}? This can't be undone from here.`)) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await softDeleteShipment(shipment.id);
      if (result.ok) router.push("/crm/shipments");
      else setDeleteError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Shipment</p>
            <p className="font-mono text-[22px] font-bold text-fg">{shipment.shipmentNumber}</p>
          </div>
          <div className="w-full max-w-[220px] sm:w-auto">
            <SelectRow label="Status" value={status} onChange={changeStatus}>
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SHIPMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </SelectRow>
          </div>
        </div>

        <FormError message={saveError} />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDeleteShipment}
            disabled={deletePending}
            className="ml-auto rounded-lg bg-[#dc2626] px-3.5 py-2 text-[13px] font-bold text-black transition-colors hover:bg-[#b91c1c] disabled:opacity-60"
          >
            {deletePending ? "Deleting…" : "Delete shipment"}
          </button>
        </div>
        <FormError message={deleteError} />
      </Card>

      {/* Mobile-only section jump nav — desktop shows every section expanded
          already, so there's nothing to jump to there. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jumpToSection(s.id)}
            className="shrink-0 whitespace-nowrap rounded-full border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Customer" {...sectionProps("customer")}>
          {(!state.accountId || customerPickerOpen) && (
            <AsyncSearchPicker<CustomerSearchResult>
              label="Search customers"
              placeholder="Search by company name…"
              search={searchCustomers}
              getKey={(c) => c.id}
              onSelect={selectCustomer}
              renderOption={(c) => (
                <>
                  <span className="font-medium">{titleCaseWords(c.name)}</span>
                  {(c.city || c.state) && (
                    <span className="ml-1.5 text-[11px] text-fg-subtle">
                      {[c.city, c.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                </>
              )}
            />
          )}
          {state.accountId && (
            <SelectedEntityChip
              title={titleCaseWords(state.customerName) || "Linked company"}
              detail="Linked to an existing company"
              onChange={() => setCustomerPickerOpen(true)}
              onReset={resetCustomer}
            />
          )}
          <TextRow
            label="Customer name"
            value={state.customerName}
            onChange={(v) => set("customerName", v)}
            onBlur={() => commit({ customerName: orNull(state.customerName) })}
          />
        </SectionCard>

        <SectionCard title="Carrier" subtitle="Assign who's hauling this load" {...sectionProps("carrier")}>
          {(!carrier || carrierPickerOpen) && (
            <AsyncSearchPicker<CrmCarrier>
              label="Search carriers"
              placeholder="Search by name, MC, or DOT…"
              search={listCarriers}
              getKey={(c) => c.id}
              onSelect={selectCarrier}
              renderOption={(c) => (
                <>
                  <span className="font-medium">{titleCaseWords(c.name)}</span>
                  {c.mcNumber && <span className="ml-1.5 text-[11px] text-fg-subtle">MC {c.mcNumber}</span>}
                </>
              )}
            />
          )}
          {carrier ? (
            <SelectedEntityChip
              title={titleCaseWords(carrier.name)}
              detail={[carrier.mcNumber ? `MC ${carrier.mcNumber}` : null, carrier.phone].filter(Boolean).join(" · ") || null}
              onChange={() => setCarrierPickerOpen(true)}
              onReset={resetCarrier}
            />
          ) : (
            <p className="text-[12px] text-fg-subtle">No carrier assigned yet.</p>
          )}
          <CarrierFormDialog
            mode="create"
            onSaved={(c) => c && selectCarrier(c)}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className={`inline-flex h-9 w-fit items-center justify-center rounded-md px-3 text-[12.5px] font-semibold transition-colors ${BTN_EDIT}`}
              >
                + Add carrier
              </button>
            )}
          />
          {carrierAutoFillSource && (
            <p className="text-[12px] font-medium text-ok">
              Auto-filled from {carrierAutoFillSource}&rsquo;s recurring carrier — editable below.
            </p>
          )}
          {carrier && carrierContacts.length > 0 && (
            <SelectRow
              label="Carrier contact"
              value={state.carrierContactId}
              onChange={selectCarrierContact}
            >
              <option value="">No specific contact</option>
              {carrierContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "Unnamed"} {c.role ? `— ${c.role}` : ""}
                </option>
              ))}
            </SelectRow>
          )}
          <MoneyRow
            label="Carrier rate"
            value={state.carrierRate}
            onChange={(v) => set("carrierRate", v)}
            onBlur={() => commit({ carrierRate: moneyOrNull(state.carrierRate) })}
          />
        </SectionCard>

        <SectionCard title="Freight" {...sectionProps("freight")}>
          <FormRow2>
            <TextRow
              label="Commodity"
              value={state.commodity}
              onChange={(v) => set("commodity", v)}
              onBlur={() => commit({ commodity: orNull(state.commodity) })}
            />
            <SelectRow label="Equipment" value={state.equipment} onChange={changeEquipment}>
              <option value="">Select equipment…</option>
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {state.equipment && !(EQUIPMENT_TYPES as readonly string[]).includes(state.equipment) && (
                <option value={state.equipment}>{state.equipment} (legacy)</option>
              )}
            </SelectRow>
          </FormRow2>
          <TextAreaRow
            label="Description"
            value={state.description}
            onChange={(v) => set("description", v)}
            onBlur={() => commit({ description: orNull(state.description) })}
            rows={2}
          />
          <FormRow2>
            <TextRow
              label="Weight"
              value={state.weight}
              onChange={(v) => set("weight", v)}
              onBlur={() => commit({ weight: orNull(state.weight) })}
            />
            <TextRow
              label="Pieces"
              value={state.pieces}
              onChange={(v) => set("pieces", v)}
              onBlur={() => commit({ pieces: orNull(state.pieces) })}
            />
          </FormRow2>
          <FormRow2>
            <TextRow
              label="PO #"
              value={state.poNumber}
              onChange={(v) => set("poNumber", v)}
              onBlur={() => commit({ poNumber: orNull(state.poNumber) })}
            />
            <TextRow
              label="Ref #s"
              value={state.refNumbers}
              onChange={(v) => set("refNumbers", v)}
              onBlur={() => commit({ refNumbers: orNull(state.refNumbers) })}
            />
          </FormRow2>
          <TextAreaRow
            label="Special instructions"
            value={state.specialInstructions}
            onChange={(v) => set("specialInstructions", v)}
            onBlur={() => commit({ specialInstructions: orNull(state.specialInstructions) })}
            rows={2}
          />
        </SectionCard>

        <SectionCard title="Notes" subtitle="Internal — not shown on any generated document" {...sectionProps("notes")}>
          <TextAreaRow
            label="Notes"
            value={state.notes}
            onChange={(v) => set("notes", v)}
            onBlur={() => commit({ notes: orNull(state.notes) })}
            rows={3}
          />
        </SectionCard>

        <SectionCard
          title="Shipper"
          {...sectionProps("shipper")}
          right={
            state.accountId ? (
              <LocationPickerModal
                accountId={state.accountId}
                customerName={state.customerName}
                label={state.shipperLocationId ? "Change location" : "Choose location"}
                onSelect={(loc) => fillFromLocation("shipper", loc)}
              />
            ) : undefined
          }
        >
          <AutoFillNote autoFill={shipperAutoFill} />
          {state.shipperLocationId && (
            <SelectedEntityChip title={state.shipperName || "Saved location"} detail="Linked to a saved location" onReset={() => resetLocation("shipper")} />
          )}
          <TextRow
            label="Name"
            value={state.shipperName}
            onChange={(v) => setShipperField("shipperName", v)}
            onBlur={() => commit({ shipperName: orNull(state.shipperName) })}
            highlight={shipperAutoFill?.fields.has("shipperName")}
          />
          <TextRow
            label="Address"
            value={state.shipperAddress}
            onChange={(v) => setShipperField("shipperAddress", v)}
            onBlur={() => commit({ shipperAddress: orNull(state.shipperAddress) })}
            highlight={shipperAutoFill?.fields.has("shipperAddress")}
          />
          <FormRow2>
            <TextRow
              label="City"
              value={state.shipperCity}
              onChange={(v) => setShipperField("shipperCity", v)}
              onBlur={() => {
                const formatted = titleCaseWords(stripCommas(state.shipperCity));
                setShipperField("shipperCity", formatted);
                commit({ shipperCity: orNull(formatted) });
              }}
              highlight={shipperAutoFill?.fields.has("shipperCity")}
            />
            <TextRow
              label="State"
              value={state.shipperState}
              onChange={(v) => setShipperField("shipperState", v)}
              onBlur={() => {
                const formatted = formatStateCase(state.shipperState);
                setShipperField("shipperState", formatted);
                commit({ shipperState: orNull(formatted) });
              }}
              highlight={shipperAutoFill?.fields.has("shipperState")}
            />
          </FormRow2>
          <TextRow
            label="ZIP"
            value={state.shipperZip}
            onChange={(v) => setShipperField("shipperZip", v)}
            onBlur={() => {
              const formatted = stripCommas(state.shipperZip);
              setShipperField("shipperZip", formatted);
              commit({ shipperZip: orNull(formatted) });
            }}
            highlight={shipperAutoFill?.fields.has("shipperZip")}
          />
          <FormRow2>
            <TextRow
              label="Contact"
              value={state.shipperContact}
              onChange={(v) => set("shipperContact", v)}
              onBlur={() => {
                const formatted = titleCaseWords(state.shipperContact);
                set("shipperContact", formatted);
                commit({ shipperContact: orNull(formatted) });
              }}
            />
            <TextRow
              label="Phone"
              value={state.shipperPhone}
              onChange={(v) => set("shipperPhone", v)}
              onBlur={() => {
                const formatted = formatPhone(state.shipperPhone);
                set("shipperPhone", formatted);
                commit({ shipperPhone: orNull(formatted) });
              }}
            />
          </FormRow2>
          {state.accountId && (
            <button
              type="button"
              onClick={() => saveAsNewLocation("shipper")}
              disabled={savingLocation === "shipper"}
              className="w-fit rounded-md border border-dashed border-fg-subtle px-3 py-1.5 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {savingLocation === "shipper" ? "Saving…" : "Save as new location"}
            </button>
          )}
        </SectionCard>

        <SectionCard
          title="Consignee"
          {...sectionProps("consignee")}
          right={
            state.accountId ? (
              <LocationPickerModal
                accountId={state.accountId}
                customerName={state.customerName}
                label={state.consigneeLocationId ? "Change location" : "Choose location"}
                onSelect={(loc) => fillFromLocation("consignee", loc)}
              />
            ) : undefined
          }
        >
          <AutoFillNote autoFill={consigneeAutoFill} />
          {state.consigneeLocationId && (
            <SelectedEntityChip title={state.consigneeName || "Saved location"} detail="Linked to a saved location" onReset={() => resetLocation("consignee")} />
          )}
          <TextRow
            label="Name"
            value={state.consigneeName}
            onChange={(v) => setConsigneeField("consigneeName", v)}
            onBlur={() => commit({ consigneeName: orNull(state.consigneeName) })}
            highlight={consigneeAutoFill?.fields.has("consigneeName")}
          />
          <TextRow
            label="Address"
            value={state.consigneeAddress}
            onChange={(v) => setConsigneeField("consigneeAddress", v)}
            onBlur={() => commit({ consigneeAddress: orNull(state.consigneeAddress) })}
            highlight={consigneeAutoFill?.fields.has("consigneeAddress")}
          />
          <FormRow2>
            <TextRow
              label="City"
              value={state.consigneeCity}
              onChange={(v) => setConsigneeField("consigneeCity", v)}
              onBlur={() => {
                const formatted = titleCaseWords(stripCommas(state.consigneeCity));
                setConsigneeField("consigneeCity", formatted);
                commit({ consigneeCity: orNull(formatted) });
              }}
              highlight={consigneeAutoFill?.fields.has("consigneeCity")}
            />
            <TextRow
              label="State"
              value={state.consigneeState}
              onChange={(v) => setConsigneeField("consigneeState", v)}
              onBlur={() => {
                const formatted = formatStateCase(state.consigneeState);
                setConsigneeField("consigneeState", formatted);
                commit({ consigneeState: orNull(formatted) });
              }}
              highlight={consigneeAutoFill?.fields.has("consigneeState")}
            />
          </FormRow2>
          <TextRow
            label="ZIP"
            value={state.consigneeZip}
            onChange={(v) => setConsigneeField("consigneeZip", v)}
            onBlur={() => {
              const formatted = stripCommas(state.consigneeZip);
              setConsigneeField("consigneeZip", formatted);
              commit({ consigneeZip: orNull(formatted) });
            }}
            highlight={consigneeAutoFill?.fields.has("consigneeZip")}
          />
          <FormRow2>
            <TextRow
              label="Contact"
              value={state.consigneeContact}
              onChange={(v) => set("consigneeContact", v)}
              onBlur={() => {
                const formatted = titleCaseWords(state.consigneeContact);
                set("consigneeContact", formatted);
                commit({ consigneeContact: orNull(formatted) });
              }}
            />
            <TextRow
              label="Phone"
              value={state.consigneePhone}
              onChange={(v) => set("consigneePhone", v)}
              onBlur={() => {
                const formatted = formatPhone(state.consigneePhone);
                set("consigneePhone", formatted);
                commit({ consigneePhone: orNull(formatted) });
              }}
            />
          </FormRow2>
          {state.accountId && (
            <button
              type="button"
              onClick={() => saveAsNewLocation("consignee")}
              disabled={savingLocation === "consignee"}
              className="w-fit rounded-md border border-dashed border-fg-subtle px-3 py-1.5 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {savingLocation === "consignee" ? "Saving…" : "Save as new location"}
            </button>
          )}
        </SectionCard>

        <SectionCard title="Pickup" {...sectionProps("pickup")}>
          <StopTimingFields
            stop="pickup"
            label="Pickup"
            date={state.pickupDate}
            mode={state.pickupTimingMode}
            appointmentTime={state.pickupAppointmentTime}
            windowStart={state.pickupWindowStart}
            windowEnd={state.pickupWindowEnd}
            legacy={pickupLegacy}
            onDate={(v) => set("pickupDate", v)}
            onDateBlur={() => commitTiming("pickup")}
            onMode={(v) => setTimingMode("pickup", v)}
            onAppointment={(v) => set("pickupAppointmentTime", v)}
            onAppointmentBlur={() => commitTiming("pickup")}
            onWindowStart={(v) => set("pickupWindowStart", v)}
            onWindowEnd={(v) => set("pickupWindowEnd", v)}
            onWindowBlur={() => commitTiming("pickup")}
          />
          <TextRow
            label="Pickup #"
            value={state.pickupNumber}
            onChange={(v) => set("pickupNumber", v)}
            onBlur={() => commit({ pickupNumber: orNull(state.pickupNumber) })}
          />
          <TextAreaRow
            label="Pickup notes"
            value={state.pickupNotes}
            onChange={(v) => set("pickupNotes", v)}
            onBlur={() => commit({ pickupNotes: orNull(state.pickupNotes) })}
            rows={2}
          />
        </SectionCard>

        <SectionCard title="Delivery" {...sectionProps("delivery")}>
          <StopTimingFields
            stop="delivery"
            label="Delivery"
            date={state.deliveryDate}
            mode={state.deliveryTimingMode}
            appointmentTime={state.deliveryAppointmentTime}
            windowStart={state.deliveryWindowStart}
            windowEnd={state.deliveryWindowEnd}
            legacy={deliveryLegacy}
            onDate={(v) => set("deliveryDate", v)}
            onDateBlur={() => commitTiming("delivery")}
            onMode={(v) => setTimingMode("delivery", v)}
            onAppointment={(v) => set("deliveryAppointmentTime", v)}
            onAppointmentBlur={() => commitTiming("delivery")}
            onWindowStart={(v) => set("deliveryWindowStart", v)}
            onWindowEnd={(v) => set("deliveryWindowEnd", v)}
            onWindowBlur={() => commitTiming("delivery")}
          />
          <TextRow
            label="Delivery #"
            value={state.deliveryNumber}
            onChange={(v) => set("deliveryNumber", v)}
            onBlur={() => commit({ deliveryNumber: orNull(state.deliveryNumber) })}
          />
          <TextAreaRow
            label="Delivery notes"
            value={state.deliveryNotes}
            onChange={(v) => set("deliveryNotes", v)}
            onBlur={() => commit({ deliveryNotes: orNull(state.deliveryNotes) })}
            rows={2}
          />
        </SectionCard>
      </div>
      {locationSaveError && <FormError message={locationSaveError} />}
    </div>
  );
}

/**
 * A stop's timing: DATE first and on its own, then how the time-of-day is
 * expressed. Date and time are separate controls on purpose — the old single
 * datetime-local made a date impossible to record without inventing an hour,
 * which is the defect this replaces.
 *
 * The time inputs shown are decided entirely by the mode, so an appointment
 * and a window are never on screen at the same time. Times use step={900}
 * (quarter-hour), matching the convention the previous window control used.
 */
function StopTimingFields({
  label,
  date,
  mode,
  appointmentTime,
  windowStart,
  windowEnd,
  legacy,
  onDate,
  onDateBlur,
  onMode,
  onAppointment,
  onAppointmentBlur,
  onWindowStart,
  onWindowEnd,
  onWindowBlur,
}: {
  stop: "pickup" | "delivery";
  label: string;
  date: string;
  mode: string;
  appointmentTime: string;
  windowStart: string;
  windowEnd: string;
  /** Read-only legacy summary, or null when this stop uses the new model. */
  legacy: string | null;
  onDate: (v: string) => void;
  onDateBlur: () => void;
  onMode: (v: string) => void;
  onAppointment: (v: string) => void;
  onAppointmentBlur: () => void;
  onWindowStart: (v: string) => void;
  onWindowEnd: (v: string) => void;
  onWindowBlur: () => void;
}) {
  const windowIncomplete =
    mode === "window" && Boolean(windowStart) && Boolean(windowEnd) && windowEnd <= windowStart;

  return (
    <>
      <TextRow
        label={`${label} date`}
        type="date"
        value={date}
        onChange={onDate}
        onBlur={onDateBlur}
      />

      <SelectRow label={`${label} timing`} value={mode} onChange={onMode}>
        <option value="">Not set</option>
        <option value="tbd">Time TBD</option>
        <option value="window">Window</option>
        <option value="appointment">Appointment</option>
      </SelectRow>

      {mode === "tbd" && (
        <p className="text-[12px] font-semibold text-fg-muted">
          Time TBD — no time will be recorded for this stop.
        </p>
      )}

      {mode === "appointment" && (
        <TextRow
          label="Appointment time"
          type="time"
          value={appointmentTime}
          onChange={onAppointment}
          onBlur={onAppointmentBlur}
        />
      )}

      {mode === "window" && (
        <>
          <FormRow2>
            <TextRow
              label="Window start"
              type="time"
              value={windowStart}
              onChange={onWindowStart}
              onBlur={onWindowBlur}
            />
            <TextRow
              label="Window end"
              type="time"
              value={windowEnd}
              onChange={onWindowEnd}
              onBlur={onWindowBlur}
            />
          </FormRow2>
          {windowIncomplete && (
            <p className="text-[12px] font-semibold text-bad">
              The window end must be later than the start. Use Appointment for a specific time.
            </p>
          )}
        </>
      )}

      {legacy && (
        <p className="rounded-[5px] border border-line-strong bg-inset px-2.5 py-1.5 text-[12px] text-fg-muted">
          <span className="font-semibold text-fg">Legacy timing:</span> {legacy}
          <br />
          Recorded before timing modes existed. Set a {label.toLowerCase()} date above to replace it.
        </p>
      )}
    </>
  );
}

function AutoFillNote({ autoFill }: { autoFill: AutoFill }) {
  if (!autoFill) return null;
  return (
    <p className="text-[12px] font-medium text-ok">
      Auto-filled from {autoFill.source} — every field stays editable.
    </p>
  );
}

function SectionCard({
  id,
  title,
  subtitle,
  right,
  open,
  onToggle,
  children,
}: {
  /** Anchor id for the mobile jump-nav (`section-${id}`) — omit to fall back
   * to the old uncontrolled-always-open `<details open>` behavior. */
  id?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Controlled open state. Omit to keep the old uncontrolled `open`
   * attribute (always expanded, matches pre-mobile-work behavior). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const controlled = open !== undefined;
  return (
    <Card id={id ? `section-${id}` : undefined}>
      <details
        {...(controlled
          ? { open, onToggle: (e: React.SyntheticEvent<HTMLDetailsElement>) => onToggle?.(e.currentTarget.open) }
          : { open: true })}
        className="group"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-line px-4 pb-2 pt-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-fg">{title}</h2>
            {subtitle && <p className="truncate text-[10.5px] text-fg-subtle">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {right}
            <IconChevronDown
              width={12}
              height={12}
              className="pointer-events-none shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
            />
          </div>
        </summary>
        <div className="flex flex-col gap-2 p-3">{children}</div>
      </details>
    </Card>
  );
}
