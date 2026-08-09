"use client";

import { useRef, useState, type ReactNode } from "react";
import { CONTROL, LABEL } from "../_shell/form";
import { BROKER_PROFILE } from "../_shell/brokerProfile";
import { REPS, repFullName } from "../_shell/reps";
import "./bill-of-lading.css";

type ChargeTerms = "prepaid" | "collect" | "third_party" | "";
type SigParty = "shipper" | "driver" | "";
type FreightCountedBy = "shipper" | "driver" | "pallets" | "";
type PalletSlip = "" | "Y" | "N";

type LineItem = {
  id: string;
  customerOrderNo: string;
  pkgs: string;
  weight: string;
  palletSlip: PalletSlip;
  additionalInfo: string;
};

type BolState = {
  // Document
  bolNumber: string;
  date: string;
  loadRef: string;
  repId: string;
  brokerContact: string;
  brokerPhone: string;
  brokerEmail: string;

  // Ship From
  shipFromName: string;
  shipFromAddress: string;
  shipFromCityStateZip: string;
  shipFromSid: string;
  shipFromContact: string;
  shipFromPhone: string;

  // Ship To
  shipToName: string;
  shipToAddress: string;
  shipToCityStateZip: string;
  shipToCid: string;
  shipToContact: string;
  shipToPhone: string;

  // Carrier
  carrierName: string;
  trailerNumber: string;
  sealNumber: string;
  scac: string;
  proNumber: string;

  // Third-Party Bill-To (optional)
  showBillTo: boolean;
  billToName: string;
  billToAddress: string;

  // Charge terms
  chargeTerms: ChargeTerms;
  masterBol: boolean;

  // Special instructions (optional)
  showSpecialInstructions: boolean;
  specialInstructions: string;

  // Line items
  lineItems: LineItem[];

  // COD (optional)
  showCod: boolean;
  codAmount: string;
  codFeeTerm: "prepaid" | "collect" | "";
  declaredValue: string;

  // Signatures
  shipperSignedDate: string;
  trailerLoadedBy: SigParty;
  freightCountedBy: FreightCountedBy;
  carrierSignedDate: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function makeLineItem(id: string): LineItem {
  return { id, customerOrderNo: "", pkgs: "", weight: "", palletSlip: "", additionalInfo: "" };
}

const INITIAL_LINE_COUNT = 5;

function initialState(makeIds: () => string[]): BolState {
  return {
    bolNumber: "",
    date: todayISO(),
    loadRef: "",
    repId: "",
    brokerContact: "",
    brokerPhone: "",
    brokerEmail: "",

    shipFromName: "",
    shipFromAddress: "",
    shipFromCityStateZip: "",
    shipFromSid: "",
    shipFromContact: "",
    shipFromPhone: "",

    shipToName: "",
    shipToAddress: "",
    shipToCityStateZip: "",
    shipToCid: "",
    shipToContact: "",
    shipToPhone: "",

    carrierName: "",
    trailerNumber: "",
    sealNumber: "",
    scac: "",
    proNumber: "",

    showBillTo: false,
    billToName: "",
    billToAddress: "",

    chargeTerms: "",
    masterBol: false,

    showSpecialInstructions: false,
    specialInstructions: "",

    lineItems: makeIds().map(makeLineItem),

    showCod: false,
    codAmount: "",
    codFeeTerm: "",
    declaredValue: "",

    shipperSignedDate: "",
    trailerLoadedBy: "",
    freightCountedBy: "",
    carrierSignedDate: "",
  };
}

function numeric(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fillable, print-to-PDF Bill of Lading generator. Pure client component
 * (no server data, no persistence) — every field is CONTROLLED state, not
 * an uncontrolled input like /crm/rate-confirmation, because the live
 * preview on the right must re-render from the same state on every
 * keystroke. The preview never shows bracket placeholders: empty fields
 * render as a bare underline (see <Blank>) so the printed document reads
 * as a clean blank BOL for whatever wasn't filled in.
 *
 * Printing reuses the "hide everything but #bol-print-area" trick from
 * rate-confirmation.css — the left form and app shell never appear in the
 * printed/PDF output.
 */
export function BillOfLadingGenerator() {
  const idCounter = useRef(0);

  function nextId() {
    idCounter.current += 1;
    return `line-${idCounter.current}`;
  }

  const [state, setState] = useState<BolState>(() =>
    initialState(() => Array.from({ length: INITIAL_LINE_COUNT }, () => nextId())),
  );

  function set<K extends keyof BolState>(key: K, value: BolState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function selectRep(repId: string) {
    const rep = REPS.find((r) => r.id === repId);
    setState((prev) => ({
      ...prev,
      repId,
      brokerContact: rep ? repFullName(rep) : "",
      brokerPhone: rep ? rep.phone : "",
      brokerEmail: rep ? rep.email : "",
    }));
  }

  function updateLineItem(id: string, patch: Partial<LineItem>) {
    setState((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((li) => (li.id === id ? { ...li, ...patch } : li)),
    }));
  }

  function addLineItem() {
    setState((prev) => ({ ...prev, lineItems: [...prev.lineItems, makeLineItem(nextId())] }));
  }

  function removeLineItem(id: string) {
    setState((prev) => ({
      ...prev,
      lineItems: prev.lineItems.length > 1 ? prev.lineItems.filter((li) => li.id !== id) : prev.lineItems,
    }));
  }

  const totalPkgs = state.lineItems.reduce((sum, li) => sum + numeric(li.pkgs), 0);
  const totalWeight = state.lineItems.reduce((sum, li) => sum + numeric(li.weight), 0);

  return (
    <div className="bol-wrap">
      <div className="bol-noprint mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          Fill in the fields on the left — the document on the right updates as you type.
          Nothing here is saved — reload and the form resets.
        </p>
        <button type="button" className="bol-print-btn shrink-0" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="bol-noprint bol-layout">
        <BolForm
          state={state}
          set={set}
          selectRep={selectRep}
          updateLineItem={updateLineItem}
          addLineItem={addLineItem}
          removeLineItem={removeLineItem}
        />
        <div className="bol-preview-panel">
          <BolDocument state={state} totalPkgs={totalPkgs} totalWeight={totalWeight} />
        </div>
      </div>

      {/* Print-only mount point, kept out of the flex layout so print CSS
          doesn't have to fight the on-screen two-column sizing — this is
          the sole print target (see #bol-print-area rules in
          bill-of-lading.css). */}
      <div className="bol-print-only">
        <div id="bol-print-area">
          <BolDocument state={state} totalPkgs={totalPkgs} totalWeight={totalWeight} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FORM (left panel)
// ============================================================================

function BolForm({
  state,
  set,
  selectRep,
  updateLineItem,
  addLineItem,
  removeLineItem,
}: {
  state: BolState;
  set: <K extends keyof BolState>(key: K, value: BolState[K]) => void;
  selectRep: (repId: string) => void;
  updateLineItem: (id: string, patch: Partial<LineItem>) => void;
  addLineItem: () => void;
  removeLineItem: (id: string) => void;
}) {
  return (
    <div className="bol-form-panel">
      <FormSection title="Document">
        <FormRow>
          <TextInput label="BOL #" value={state.bolNumber} onChange={(v) => set("bolNumber", v)} />
          <TextInput label="Date" value={state.date} onChange={(v) => set("date", v)} type="date" />
        </FormRow>
        <TextInput label="Load / Ref #" value={state.loadRef} onChange={(v) => set("loadRef", v)} />
        <SelectInput
          label="Broker Rep"
          value={state.repId}
          onChange={selectRep}
          options={[
            { value: "", label: "— Select —" },
            ...REPS.map((r) => ({ value: r.id, label: repFullName(r) })),
          ]}
        />
        <FormRow>
          <TextInput
            label="Broker Contact"
            value={state.brokerContact}
            onChange={(v) => set("brokerContact", v)}
          />
          <TextInput label="Broker Phone" value={state.brokerPhone} onChange={(v) => set("brokerPhone", v)} />
        </FormRow>
        <TextInput label="Broker Email" value={state.brokerEmail} onChange={(v) => set("brokerEmail", v)} />
      </FormSection>

      <FormSection title="Ship From">
        <TextInput label="Name" value={state.shipFromName} onChange={(v) => set("shipFromName", v)} />
        <TextInput label="Address" value={state.shipFromAddress} onChange={(v) => set("shipFromAddress", v)} />
        <TextInput
          label="City / State / ZIP"
          value={state.shipFromCityStateZip}
          onChange={(v) => set("shipFromCityStateZip", v)}
        />
        <FormRow>
          <TextInput label="SID #" value={state.shipFromSid} onChange={(v) => set("shipFromSid", v)} />
          <TextInput label="Contact" value={state.shipFromContact} onChange={(v) => set("shipFromContact", v)} />
        </FormRow>
        <TextInput label="Phone" value={state.shipFromPhone} onChange={(v) => set("shipFromPhone", v)} />
      </FormSection>

      <FormSection title="Ship To">
        <TextInput label="Name" value={state.shipToName} onChange={(v) => set("shipToName", v)} />
        <TextInput label="Address" value={state.shipToAddress} onChange={(v) => set("shipToAddress", v)} />
        <TextInput
          label="City / State / ZIP"
          value={state.shipToCityStateZip}
          onChange={(v) => set("shipToCityStateZip", v)}
        />
        <FormRow>
          <TextInput label="CID #" value={state.shipToCid} onChange={(v) => set("shipToCid", v)} />
          <TextInput label="Contact" value={state.shipToContact} onChange={(v) => set("shipToContact", v)} />
        </FormRow>
        <TextInput label="Phone" value={state.shipToPhone} onChange={(v) => set("shipToPhone", v)} />
      </FormSection>

      <FormSection title="Carrier / Bill-To">
        <TextInput label="Carrier Name" value={state.carrierName} onChange={(v) => set("carrierName", v)} />
        <FormRow>
          <TextInput
            label="Trailer / Unit #"
            value={state.trailerNumber}
            onChange={(v) => set("trailerNumber", v)}
          />
          <TextInput label="Seal #" value={state.sealNumber} onChange={(v) => set("sealNumber", v)} />
        </FormRow>
        <FormRow>
          <TextInput label="SCAC" value={state.scac} onChange={(v) => set("scac", v)} />
          <TextInput label="Pro #" value={state.proNumber} onChange={(v) => set("proNumber", v)} />
        </FormRow>
        <ToggleRow
          label="Include Third-Party Bill-To"
          checked={state.showBillTo}
          onChange={(v) => set("showBillTo", v)}
        />
        {state.showBillTo && (
          <>
            <TextInput label="Bill-To Name" value={state.billToName} onChange={(v) => set("billToName", v)} />
            <TextInput
              label="Bill-To Address"
              value={state.billToAddress}
              onChange={(v) => set("billToAddress", v)}
            />
          </>
        )}
      </FormSection>

      <FormSection title="Charge Terms & Instructions">
        <SelectInput
          label="Freight Charge Terms"
          value={state.chargeTerms}
          onChange={(v) => set("chargeTerms", v as ChargeTerms)}
          options={[
            { value: "", label: "— Select —" },
            { value: "prepaid", label: "Prepaid" },
            { value: "collect", label: "Collect" },
            { value: "third_party", label: "3rd Party" },
          ]}
        />
        <ToggleRow
          label="Master BOL — with attached underlying BOLs"
          checked={state.masterBol}
          onChange={(v) => set("masterBol", v)}
        />
        <ToggleRow
          label="Include Special Instructions"
          checked={state.showSpecialInstructions}
          onChange={(v) => set("showSpecialInstructions", v)}
        />
        {state.showSpecialInstructions && (
          <TextAreaInput
            label="Special Instructions"
            value={state.specialInstructions}
            onChange={(v) => set("specialInstructions", v)}
          />
        )}
      </FormSection>

      <FormSection title="Line Items">
        {state.lineItems.map((li, idx) => (
          <div
            key={li.id}
            className="space-y-2.5 rounded-md border border-fg-subtle/60 bg-card/60 p-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted">
                Line {idx + 1}
              </span>
              {state.lineItems.length > 1 && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-bad hover:underline"
                  onClick={() => removeLineItem(li.id)}
                  aria-label={`Remove line ${idx + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
            <TextInput
              label="Customer Order No."
              value={li.customerOrderNo}
              onChange={(v) => updateLineItem(li.id, { customerOrderNo: v })}
            />
            <FormRow>
              <TextInput label="# Pkgs" value={li.pkgs} onChange={(v) => updateLineItem(li.id, { pkgs: v })} />
              <TextInput
                label="Weight"
                value={li.weight}
                onChange={(v) => updateLineItem(li.id, { weight: v })}
              />
            </FormRow>
            <SelectInput
              label="Pallet / Slip (Y/N)"
              value={li.palletSlip}
              onChange={(v) => updateLineItem(li.id, { palletSlip: v as PalletSlip })}
              options={[
                { value: "", label: "— Select —" },
                { value: "Y", label: "Y" },
                { value: "N", label: "N" },
              ]}
            />
            <TextInput
              label="Additional Shipper Info"
              value={li.additionalInfo}
              onChange={(v) => updateLineItem(li.id, { additionalInfo: v })}
            />
          </div>
        ))}
        <button
          type="button"
          className="w-full rounded-md border border-dashed border-fg-subtle py-2 text-[12px] font-semibold text-fg-muted hover:border-accent hover:text-accent"
          onClick={addLineItem}
        >
          + Add line
        </button>
      </FormSection>

      <FormSection title="COD & Signatures">
        <ToggleRow label="Include COD" checked={state.showCod} onChange={(v) => set("showCod", v)} />
        {state.showCod && (
          <>
            <FormRow>
              <TextInput label="COD Amount" value={state.codAmount} onChange={(v) => set("codAmount", v)} />
              <SelectInput
                label="COD Fee Terms"
                value={state.codFeeTerm}
                onChange={(v) => set("codFeeTerm", v as "prepaid" | "collect" | "")}
                options={[
                  { value: "", label: "— Select —" },
                  { value: "prepaid", label: "Prepaid" },
                  { value: "collect", label: "Collect" },
                ]}
              />
            </FormRow>
          </>
        )}
        <TextInput
          label="Agreed / Declared Value"
          value={state.declaredValue}
          onChange={(v) => set("declaredValue", v)}
        />
        <TextInput
          label="Shipper Signed Date"
          value={state.shipperSignedDate}
          onChange={(v) => set("shipperSignedDate", v)}
        />
        <SelectInput
          label="Trailer Loaded By"
          value={state.trailerLoadedBy}
          onChange={(v) => set("trailerLoadedBy", v as SigParty)}
          options={[
            { value: "", label: "— Select —" },
            { value: "shipper", label: "By Shipper" },
            { value: "driver", label: "By Driver" },
          ]}
        />
        <SelectInput
          label="Freight Counted By"
          value={state.freightCountedBy}
          onChange={(v) => set("freightCountedBy", v as FreightCountedBy)}
          options={[
            { value: "", label: "— Select —" },
            { value: "shipper", label: "By Shipper" },
            { value: "driver", label: "By Driver" },
            { value: "pallets", label: "Pallets Said to Contain" },
          ]}
        />
        <TextInput
          label="Carrier Signed / Pickup Date"
          value={state.carrierSignedDate}
          onChange={(v) => set("carrierSignedDate", v)}
        />
      </FormSection>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4 space-y-2.5 border-b border-fg-subtle/40 pb-4 last:border-b-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">{title}</h3>
      {children}
    </div>
  );
}

function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1 bol-form-field">
      <span className={LABEL}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-full min-w-0 text-[13px] ${CONTROL}`}
      />
    </label>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1 bol-form-field">
      <span className={LABEL}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className={`w-full min-w-0 resize-y py-2 text-[13px] leading-relaxed ${CONTROL}`}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1 bol-form-field">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-full min-w-0 text-[13px] ${CONTROL}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-fg-subtle bg-card px-3 py-2 bol-form-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="text-[13px] font-medium text-fg">{label}</span>
    </label>
  );
}

// ============================================================================
// DOCUMENT (right panel / print target)
// ============================================================================

function BolDocument({
  state,
  totalPkgs,
  totalWeight,
}: {
  state: BolState;
  totalPkgs: number;
  totalWeight: number;
}) {
  return (
    <div className="bol-page">
      <header className="bol-header">
        <div>
          <p className="bol-wordmark">{BROKER_PROFILE.name.toUpperCase()}</p>
          {BROKER_PROFILE.address && <p className="bol-broker-line">{BROKER_PROFILE.address}</p>}
          <p className="bol-broker-line">
            <Blank value={state.brokerContact} width={110} /> &nbsp;·&nbsp;{" "}
            <Blank value={state.brokerPhone} width={100} />
          </p>
          <p className="bol-broker-line">
            <Blank value={state.brokerEmail} width={160} />
          </p>
          <p className="bol-broker-line">
            MC {BROKER_PROFILE.mc} &nbsp;·&nbsp; DOT {BROKER_PROFILE.dot}
          </p>
        </div>
        <div className="bol-header-right">
          <p className="bol-doc-title">BILL OF LADING</p>
          <p className="bol-doc-subtitle">STRAIGHT BILL OF LADING — NOT NEGOTIABLE</p>
          <p className="bol-header-line">
            BOL #: <Blank value={state.bolNumber} width={90} />
          </p>
          <p className="bol-header-line">
            Date: <Blank value={state.date} width={90} />
          </p>
          <p className="bol-header-line">
            Load / Ref #: <Blank value={state.loadRef} width={90} />
          </p>
        </div>
      </header>

      <section className="bol-cols-2 bol-section">
        <div className="bol-box">
          <SectionHeading>Ship From</SectionHeading>
          <DocField label="Name" value={state.shipFromName} />
          <DocField label="Address" value={state.shipFromAddress} />
          <DocField label="City / State / ZIP" value={state.shipFromCityStateZip} />
          <div className="bol-cols-2">
            <DocField label="SID #" value={state.shipFromSid} />
            <DocField label="Contact / Phone" value={joinContact(state.shipFromContact, state.shipFromPhone)} />
          </div>
        </div>
        <div className="bol-box">
          <SectionHeading>Ship To</SectionHeading>
          <DocField label="Name" value={state.shipToName} />
          <DocField label="Address" value={state.shipToAddress} />
          <DocField label="City / State / ZIP" value={state.shipToCityStateZip} />
          <div className="bol-cols-2">
            <DocField label="CID #" value={state.shipToCid} />
            <DocField label="Contact / Phone" value={joinContact(state.shipToContact, state.shipToPhone)} />
          </div>
        </div>
      </section>

      <section className="bol-cols-2 bol-section">
        <div className="bol-box">
          <SectionHeading>Carrier</SectionHeading>
          <DocField label="Name" value={state.carrierName} />
          <div className="bol-cols-2">
            <DocField label="Trailer / Unit #" value={state.trailerNumber} />
            <DocField label="Seal #" value={state.sealNumber} />
          </div>
          <div className="bol-cols-2">
            <DocField label="SCAC" value={state.scac} />
            <DocField label="Pro #" value={state.proNumber} />
          </div>
        </div>
        <div className="bol-box">
          <SectionHeading>Third-Party Bill-To</SectionHeading>
          {state.showBillTo ? (
            <>
              <DocField label="Name" value={state.billToName} />
              <DocField label="Address" value={state.billToAddress} />
            </>
          ) : (
            <p className="bol-muted-note">N/A</p>
          )}
        </div>
      </section>

      <section className="bol-section bol-charge-row">
        <div className="bol-charge-terms">
          <span className="bol-charge-label">Freight Charge Terms:</span>
          <CheckOption label="Prepaid" checked={state.chargeTerms === "prepaid"} />
          <CheckOption label="Collect" checked={state.chargeTerms === "collect"} />
          <CheckOption label="3rd Party" checked={state.chargeTerms === "third_party"} />
        </div>
        <CheckOption label="Master BOL — with attached underlying BOLs" checked={state.masterBol} />
      </section>

      {state.showSpecialInstructions && state.specialInstructions.trim() && (
        <section className="bol-section bol-box">
          <SectionHeading>Special Instructions</SectionHeading>
          <p className="bol-flow-text">{state.specialInstructions}</p>
        </section>
      )}

      <section className="bol-section">
        <SectionHeading>Customer Order Information</SectionHeading>
        <table className="bol-table">
          <thead>
            <tr>
              <th>Customer Order No.</th>
              <th className="bol-col-narrow"># Pkgs</th>
              <th className="bol-col-narrow">Weight</th>
              <th className="bol-col-narrow">Pallet / Slip (Y/N)</th>
              <th>Additional Shipper Info</th>
            </tr>
          </thead>
          <tbody>
            {state.lineItems.map((li) => (
              <tr key={li.id}>
                <td>
                  <Blank value={li.customerOrderNo} block />
                </td>
                <td className="bol-col-narrow">
                  <Blank value={li.pkgs} block />
                </td>
                <td className="bol-col-narrow">
                  <Blank value={li.weight} block />
                </td>
                <td className="bol-col-narrow">
                  <Blank value={li.palletSlip} block />
                </td>
                <td>
                  <Blank value={li.additionalInfo} block />
                </td>
              </tr>
            ))}
            <tr className="bol-total-row">
              <td>GRAND TOTAL</td>
              <td className="bol-col-narrow">{totalPkgs > 0 ? totalPkgs : ""}</td>
              <td className="bol-col-narrow">{totalWeight > 0 ? totalWeight : ""}</td>
              <td className="bol-col-narrow" />
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="bol-section bol-cols-2">
        <div>
          {state.showCod && (
            <p className="bol-cod-line">
              COD Amount: $<Blank value={state.codAmount} width={70} /> &nbsp;Fee Terms:{" "}
              <CheckOption label="Prepaid" checked={state.codFeeTerm === "prepaid"} inline />
              <CheckOption label="Collect" checked={state.codFeeTerm === "collect"} inline />
            </p>
          )}
          <p className="bol-cod-line">
            Agreed / Declared Value: $<Blank value={state.declaredValue} width={90} />
          </p>
        </div>
        <p className="bol-notice">
          Liability limitation for loss or damage on this shipment may be applicable. See 49
          U.S.C. 14706(c)(1)(A) and (B).
        </p>
      </section>

      <section className="bol-section bol-cert">
        <p>
          RECEIVED, subject to individually determined rates or contracts that have been agreed
          upon in writing between the carrier and shipper, if applicable, otherwise to the rates,
          classifications, and rules that have been established by the carrier and are available
          to the shipper on request; and to all applicable state and federal regulations.
        </p>
        <p>
          <strong>Shipper Certification:</strong> This is to certify that the above-named
          materials are properly classified, described, packaged, marked, and labeled, and are in
          proper condition for transportation according to the applicable regulations of the DOT.
        </p>
      </section>

      <section className="bol-section bol-sig-row">
        <div className="bol-sig-col">
          <div className="bol-sig-line" />
          <span className="bol-sig-label">Shipper Signature</span>
          <p className="bol-sig-date">
            Date: <Blank value={state.shipperSignedDate} width={90} />
          </p>
        </div>
        <div className="bol-sig-col">
          <p className="bol-sig-checks-title">Trailer Loaded</p>
          <CheckOption label="By Shipper" checked={state.trailerLoadedBy === "shipper"} />
          <CheckOption label="By Driver" checked={state.trailerLoadedBy === "driver"} />
          <p className="bol-sig-checks-title" style={{ marginTop: 6 }}>
            Freight Counted
          </p>
          <CheckOption label="By Shipper" checked={state.freightCountedBy === "shipper"} />
          <CheckOption label="By Driver" checked={state.freightCountedBy === "driver"} />
          <CheckOption label="Pallets Said to Contain" checked={state.freightCountedBy === "pallets"} />
        </div>
        <div className="bol-sig-col">
          <div className="bol-sig-line" />
          <span className="bol-sig-label">Carrier Signature</span>
          <p className="bol-sig-date">
            Pickup Date: <Blank value={state.carrierSignedDate} width={90} />
          </p>
          <p className="bol-sig-ack">Carrier acknowledges receipt of packages and required placards.</p>
        </div>
      </section>
    </div>
  );
}

function joinContact(contact: string, phone: string): string {
  if (contact && phone) return `${contact} · ${phone}`;
  return contact || phone;
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="bol-heading">{children}</h2>;
}

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <p className="bol-doc-field">
      <span className="bol-doc-field-label">{label}:</span> <Blank value={value} />
    </p>
  );
}

function Blank({
  value,
  width,
  block,
}: {
  value: string;
  width?: number;
  block?: boolean;
}) {
  return (
    <span
      className={`bol-blank${block ? " bol-blank-block" : ""}`}
      style={width ? { minWidth: width } : undefined}
    >
      {value ? value : " "}
    </span>
  );
}

function CheckOption({
  label,
  checked,
  inline,
}: {
  label: string;
  checked: boolean;
  inline?: boolean;
}) {
  return (
    <span className={`bol-check-option${inline ? " bol-check-option-inline" : ""}`}>
      <span className={`bol-checkbox${checked ? " is-checked" : ""}`}>{checked ? "✓" : ""}</span>
      {label}
    </span>
  );
}
