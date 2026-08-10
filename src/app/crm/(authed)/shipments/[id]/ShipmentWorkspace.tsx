"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, BTN_PRIMARY, BTN_EDIT } from "../../_shell/ui";
import { FormError } from "../../_shell/form";
import { AsyncSearchPicker } from "../../_shell/AsyncSearchPicker";
import { toDatetimeLocal, centralInputToIso, titleCaseWords } from "../../_shell/format";
import { IconChevronDown } from "../../_shell/icons";
import { TextRow, TextAreaRow, MoneyRow, SelectRow, FormRow2, SelectedEntityChip, TimeWindowRow } from "./fields";
import { LocationPickerModal } from "./LocationPickerModal";
import { CarrierFormDialog } from "../../carriers/CarrierFormDialog";
import { updateShipment, searchCustomers, createAccountLocation, softDeleteShipment } from "../actions";
import { listCarriers } from "../carriers-actions";
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL, shipmentStatusTone } from "../statusMeta";
import type {
  CrmAccountLocation,
  CrmCarrier,
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
  pickupAt: string;
  pickupWindow: string;
  pickupNumber: string;
  pickupNotes: string;
  deliveryAt: string;
  deliveryWindow: string;
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
  notes: string;
};

const SHIPPER_AUTOFILL_KEYS = [
  "shipperName",
  "shipperAddress",
  "shipperCity",
  "shipperState",
  "shipperZip",
] as const satisfies readonly (keyof LocalState)[];

const CONSIGNEE_AUTOFILL_KEYS = [
  "consigneeName",
  "consigneeAddress",
  "consigneeCity",
  "consigneeState",
  "consigneeZip",
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
    pickupAt: toDatetimeLocal(shipment.pickupAt),
    pickupWindow: str(shipment.pickupWindow),
    pickupNumber: str(shipment.pickupNumber),
    pickupNotes: str(shipment.pickupNotes),
    deliveryAt: toDatetimeLocal(shipment.deliveryAt),
    deliveryWindow: str(shipment.deliveryWindow),
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
export function ShipmentWorkspace({ shipment }: { shipment: CrmShipmentDetail }) {
  const router = useRouter();
  const [state, setState] = useState<LocalState>(() => toLocal(shipment));
  const [status, setStatus] = useState(shipment.status);
  const [carrier, setCarrier] = useState<CrmCarrier | null>(shipment.carrier);
  const [shipperAutoFill, setShipperAutoFill] = useState<AutoFill>(null);
  const [consigneeAutoFill, setConsigneeAutoFill] = useState<AutoFill>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [carrierPickerOpen, setCarrierPickerOpen] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startSaveTransition] = useTransition();

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function set<K extends keyof LocalState>(key: K, value: LocalState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

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
          }
        : {
            consigneeLocationId: loc.id,
            consigneeName: name,
            consigneeAddress: str(loc.address),
            consigneeCity: str(loc.city),
            consigneeState: str(loc.state),
            consigneeZip: str(loc.zip),
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
          }
        : {
            consigneeLocationId: loc.id,
            consigneeName: name || null,
            consigneeAddress: orNull(str(loc.address)),
            consigneeCity: orNull(str(loc.city)),
            consigneeState: orNull(str(loc.state)),
            consigneeZip: orNull(str(loc.zip)),
          },
    );
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
    commit({ carrierId: c.id });
  }

  function resetCarrier() {
    setCarrierPickerOpen(false);
    setCarrier(null);
    commit({ carrierId: null });
  }

  // ── Status ──────────────────────────────────────────────────────────────

  function changeStatus(v: string) {
    setStatus(v);
    commit({ status: v });
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Customer">
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

        <SectionCard title="Carrier" subtitle="Assign who's hauling this load">
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
          <MoneyRow
            label="Carrier rate"
            value={state.carrierRate}
            onChange={(v) => set("carrierRate", v)}
            onBlur={() => commit({ carrierRate: moneyOrNull(state.carrierRate) })}
          />
        </SectionCard>

        <SectionCard title="Freight">
          <FormRow2>
            <TextRow
              label="Commodity"
              value={state.commodity}
              onChange={(v) => set("commodity", v)}
              onBlur={() => commit({ commodity: orNull(state.commodity) })}
            />
            <TextRow
              label="Equipment"
              value={state.equipment}
              onChange={(v) => set("equipment", v)}
              onBlur={() => commit({ equipment: orNull(state.equipment) })}
              placeholder="e.g. Dry van, Reefer, Flatbed"
            />
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

        <SectionCard title="Notes" subtitle="Internal — not shown on any generated document">
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
              onBlur={() => commit({ shipperCity: orNull(state.shipperCity) })}
              highlight={shipperAutoFill?.fields.has("shipperCity")}
            />
            <TextRow
              label="State"
              value={state.shipperState}
              onChange={(v) => setShipperField("shipperState", v)}
              onBlur={() => commit({ shipperState: orNull(state.shipperState) })}
              highlight={shipperAutoFill?.fields.has("shipperState")}
            />
          </FormRow2>
          <TextRow
            label="ZIP"
            value={state.shipperZip}
            onChange={(v) => setShipperField("shipperZip", v)}
            onBlur={() => commit({ shipperZip: orNull(state.shipperZip) })}
            highlight={shipperAutoFill?.fields.has("shipperZip")}
          />
          <FormRow2>
            <TextRow
              label="Contact"
              value={state.shipperContact}
              onChange={(v) => set("shipperContact", v)}
              onBlur={() => commit({ shipperContact: orNull(state.shipperContact) })}
            />
            <TextRow
              label="Phone"
              value={state.shipperPhone}
              onChange={(v) => set("shipperPhone", v)}
              onBlur={() => commit({ shipperPhone: orNull(state.shipperPhone) })}
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
              onBlur={() => commit({ consigneeCity: orNull(state.consigneeCity) })}
              highlight={consigneeAutoFill?.fields.has("consigneeCity")}
            />
            <TextRow
              label="State"
              value={state.consigneeState}
              onChange={(v) => setConsigneeField("consigneeState", v)}
              onBlur={() => commit({ consigneeState: orNull(state.consigneeState) })}
              highlight={consigneeAutoFill?.fields.has("consigneeState")}
            />
          </FormRow2>
          <TextRow
            label="ZIP"
            value={state.consigneeZip}
            onChange={(v) => setConsigneeField("consigneeZip", v)}
            onBlur={() => commit({ consigneeZip: orNull(state.consigneeZip) })}
            highlight={consigneeAutoFill?.fields.has("consigneeZip")}
          />
          <FormRow2>
            <TextRow
              label="Contact"
              value={state.consigneeContact}
              onChange={(v) => set("consigneeContact", v)}
              onBlur={() => commit({ consigneeContact: orNull(state.consigneeContact) })}
            />
            <TextRow
              label="Phone"
              value={state.consigneePhone}
              onChange={(v) => set("consigneePhone", v)}
              onBlur={() => commit({ consigneePhone: orNull(state.consigneePhone) })}
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

        <SectionCard title="Pickup">
          <TextRow
            label="Pickup date/time"
            type="datetime-local"
            value={state.pickupAt}
            onChange={(v) => set("pickupAt", v)}
            onBlur={() => commit({ pickupAt: centralInputToIso(state.pickupAt) })}
          />
          <TimeWindowRow
            label="Pickup window"
            value={state.pickupWindow}
            onChange={(v) => set("pickupWindow", v)}
            onBlur={() => commit({ pickupWindow: orNull(state.pickupWindow) })}
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

        <SectionCard title="Delivery">
          <TextRow
            label="Delivery date/time"
            type="datetime-local"
            value={state.deliveryAt}
            onChange={(v) => set("deliveryAt", v)}
            onBlur={() => commit({ deliveryAt: centralInputToIso(state.deliveryAt) })}
          />
          <TimeWindowRow
            label="Delivery window"
            value={state.deliveryWindow}
            onChange={(v) => set("deliveryWindow", v)}
            onBlur={() => commit({ deliveryWindow: orNull(state.deliveryWindow) })}
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

function AutoFillNote({ autoFill }: { autoFill: AutoFill }) {
  if (!autoFill) return null;
  return (
    <p className="text-[12px] font-medium text-ok">
      Auto-filled from {autoFill.source} — every field stays editable.
    </p>
  );
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <details open className="group">
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
