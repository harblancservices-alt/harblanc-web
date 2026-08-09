"use client";

import { useState, type ReactNode } from "react";
import type { BrokerProfile } from "../_shell/brokerProfile";
import type { OrgUser } from "../_shell/orgUsers";
import "./rate-confirmation.css";

function brokerAddressLine(profile: BrokerProfile): string {
  return [profile.address, profile.phone].filter(Boolean).join(" · ");
}

/**
 * Fillable, print-to-PDF Hello Hotshot carrier Rate Confirmation. Almost
 * every field is an uncontrolled <input>/<textarea> the user types into
 * directly before printing (no server data, no persistence) —
 * window.print() renders whatever is currently in the DOM. The exception is
 * the broker header: company name/MC/DOT/address come from `brokerProfile`
 * (fetched server-side from CRM Settings' crm_broker_profile) and the
 * Broker Contact person is picked from a dropdown of `orgUsers`, same
 * auto-fill pattern as /crm/bill-of-lading — selecting a rep fills their
 * name/phone/email into controlled state, still editable afterward.
 *
 * The document itself is intentionally grayscale (black/white/light-gray)
 * regardless of the CRM's `.crm-light` theme — see rate-confirmation.css.
 * Printing uses the "hide everything but #rc-print-area" trick so the CRM
 * shell (sidebar/bottom nav) never appears in the printed/PDF output,
 * without touching CrmShell itself.
 */
export function RateConfirmationDocument({
  orgUsers,
  brokerProfile,
}: {
  orgUsers: OrgUser[];
  brokerProfile: BrokerProfile;
}) {
  const [repId, setRepId] = useState("");
  const [brokerContact, setBrokerContact] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");

  function selectRep(id: string) {
    const rep = orgUsers.find((u) => u.id === id);
    setRepId(id);
    setBrokerContact(rep ? rep.name : "");
    setBrokerPhone(rep ? rep.phone : "");
    setBrokerEmail(rep ? rep.email : "");
  }

  return (
    <div className="rc-wrap">
      <div className="rc-noprint mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg-muted">
          Fill in the fields below, then print or save as PDF. Nothing here is saved —
          reload and the form resets.
        </p>
        <button
          type="button"
          className="rc-print-btn shrink-0"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>

      <div id="rc-print-area">
        {/* ============================== PAGE 1 ============================== */}
        <div className="rc-page">
          <header className="rc-header">
            <div>
              <p className="rc-wordmark">{brokerProfile.name.toUpperCase()}</p>
              {brokerAddressLine(brokerProfile) && (
                <p className="rc-broker-line">{brokerAddressLine(brokerProfile)}</p>
              )}
              <p className="rc-broker-line">{brokerContact || "[Broker Contact Name]"}</p>
              <p className="rc-broker-line">
                {brokerPhone || "[Broker Phone]"} &nbsp;·&nbsp; {brokerEmail || "[Broker Email]"}
              </p>
              <p className="rc-broker-line">
                MC {brokerProfile.mc || "[ ]"} &nbsp;·&nbsp; DOT {brokerProfile.dot || "[ ]"}
              </p>
            </div>
            <div className="rc-header-right">
              <p className="rc-doc-title">RATE CONFIRMATION</p>
              <Field label="Load #" name="load_number_header" />
              <Field label="Issued" name="issued_date" placeholder="MM/DD/YYYY" />
            </div>
          </header>

          <section className="rc-section">
            <div className="rc-grid-6">
              <Field label="Load #" name="load_number" />
              <Field label="Equipment" name="equipment" />
              <Field label="Commodity" name="commodity" />
              <Field label="Weight" name="weight" />
              <Field label="Miles" name="miles" />
              <Field label="Pieces / Pallets" name="pieces_pallets" />
            </div>
            <div className="rc-grid-6" style={{ marginTop: 8 }}>
              <Field label="Pickup #" name="overview_pickup_number" />
              <Field label="Delivery #" name="overview_delivery_number" />
              <Field label="PO #" name="po_number" />
              <Field label="BOL #" name="bol_number" />
              <Field label="Securement" name="securement" />
              <Field label="Service Type" name="service_type" />
            </div>
          </section>

          <section className="rc-section rc-cols-2">
            <div>
              <SectionHeading>Broker</SectionHeading>
              <label className="rc-field rc-noprint">
                <span className="rc-field-label">Broker Contact</span>
                <select
                  value={repId}
                  onChange={(e) => selectRep(e.target.value)}
                  className="rc-input"
                >
                  <option value="">— Select —</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rc-row-3">
                <ControlledField label="Contact" value={brokerContact} onChange={setBrokerContact} />
                <ControlledField label="Phone" value={brokerPhone} onChange={setBrokerPhone} />
                <ControlledField label="Email" value={brokerEmail} onChange={setBrokerEmail} />
              </div>
            </div>
            <div>
              <SectionHeading>Carrier</SectionHeading>
              <Field label="Carrier Legal Name" name="carrier_legal_name" />
              <div className="rc-row-3">
                <Field label="Dispatcher / Contact" name="carrier_dispatcher" />
                <Field label="Phone" name="carrier_dispatcher_phone" />
                <Field label="Email" name="carrier_dispatcher_email" />
              </div>
              <div className="rc-row-3">
                <Field label="Driver Name" name="carrier_driver_name" />
                <Field label="Driver Phone" name="carrier_driver_phone" />
                <Field label="Truck / Trailer #" name="carrier_truck_trailer" />
              </div>
              <div className="rc-row-3">
                <Field label="MC #" name="carrier_mc" />
                <Field label="DOT #" name="carrier_dot" />
              </div>
            </div>
          </section>

          <section className="rc-section rc-box">
            <div className="rc-cols-2">
              <Field label="Pickup Facility / Company" name="pickup_facility" />
              <Field label="Appointment / Window" name="pickup_appointment" />
            </div>
            <div style={{ marginTop: 8 }}>
              <Field label="Address" name="pickup_address" />
            </div>
            <div className="rc-row-3">
              <Field label="Contact Name" name="pickup_contact_name" />
              <Field label="Contact Phone" name="pickup_contact_phone" />
              <Field label="Pickup Number" name="pickup_number" />
            </div>
            <div style={{ marginTop: 8 }}>
              <TextAreaField
                label="Notes — Gate / Loading / PPE / Special Requirements"
                name="pickup_notes"
              />
            </div>
          </section>

          <section className="rc-section rc-box">
            <div className="rc-cols-2">
              <Field label="Delivery Facility / Company" name="delivery_facility" />
              <Field label="Appointment / Window" name="delivery_appointment" />
            </div>
            <div style={{ marginTop: 8 }}>
              <Field label="Address" name="delivery_address" />
            </div>
            <div className="rc-row-3">
              <Field label="Contact Name" name="delivery_contact_name" />
              <Field label="Contact Phone" name="delivery_contact_phone" />
              <Field label="Delivery Number" name="delivery_number" />
            </div>
            <div style={{ marginTop: 8 }}>
              <TextAreaField
                label="Notes — Receiving / Lumper / Special Handling"
                name="delivery_notes"
              />
            </div>
          </section>

          <section className="rc-section">
            <TextAreaField label="Special Instructions" name="special_instructions" />
          </section>

          <section className="rc-section rc-rate-section">
            <div className="rc-heading-row">
              <h2 className="rc-heading">Rate &amp; Payment</h2>
              <div className="rc-heading-total">
                TOTAL CARRIER PAY: $
                <input
                  type="text"
                  name="total_carrier_pay"
                  className="rc-input"
                  style={{ width: 90 }}
                  placeholder="0.00"
                />
              </div>
            </div>

            <table className="rc-rate-table">
              <tbody>
                <tr>
                  <td className="rc-rate-static-label">Linehaul</td>
                  <td className="rc-rate-amount">
                    <div className="rc-rate-amount-input">
                      $
                      <input
                        type="text"
                        name="linehaul_amount"
                        className="rc-input"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                </tr>
                {[1, 2, 3].map((n) => (
                  <tr key={n}>
                    <td className="rc-rate-label">
                      <input
                        type="text"
                        name={`charge_${n}_label`}
                        className="rc-input"
                        placeholder="[Charge description]"
                      />
                    </td>
                    <td className="rc-rate-amount">
                      <div className="rc-rate-amount-input">
                        $
                        <input
                          type="text"
                          name={`charge_${n}_amount`}
                          className="rc-input"
                          placeholder="0.00"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="rc-total-row">
                  <td>TOTAL CARRIER PAY</td>
                  <td className="rc-rate-amount">
                    <div className="rc-rate-amount-input">
                      $
                      <input
                        type="text"
                        name="total_carrier_pay_table"
                        className="rc-input"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="rc-cols-2" style={{ marginTop: 10 }}>
              <Field
                label="Payment Terms"
                name="payment_terms"
                placeholder="[e.g., Net 30]"
              />
              <Field
                label="Quick Pay"
                name="quick_pay"
                placeholder="[e.g., 2% fee — Requested / Not Requested]"
              />
            </div>

            <p className="rc-notice">
              Signed POD and invoice are required for payment. Accessorial charges
              require prior written broker approval. No double brokering, rebrokering,
              or unauthorized transfer of this shipment.
            </p>
          </section>
        </div>

        {/* ============================== PAGE 2 ============================== */}
        <div className="rc-page rc-page2">
          <p className="rc-ref-line">
            Load #:{" "}
            <input
              type="text"
              name="ref_load_number"
              className="rc-input"
              style={{ display: "inline-block", width: 100 }}
            />{" "}
            | Carrier:{" "}
            <input
              type="text"
              name="ref_carrier_name"
              className="rc-input"
              style={{ display: "inline-block", width: 200 }}
            />{" "}
            | Total Carrier Pay: ${" "}
            <input
              type="text"
              name="ref_total_carrier_pay"
              className="rc-input"
              style={{ display: "inline-block", width: 100 }}
              placeholder="0.00"
            />
          </p>

          <section className="rc-section">
            <SectionHeading>Carrier Obligations</SectionHeading>
            <ol className="rc-obligations">
              <li>
                Carrier accepts the assigned rate, route, dates, and appointment
                requirements.
              </li>
              <li>
                Carrier must promptly report delays, breakdowns, accidents, shortages,
                damage, cargo claims, or service failures.
              </li>
              <li>
                Carrier must follow applicable FMCSA, DOT, cargo securement, insurance,
                and safety requirements.
              </li>
              <li>
                Carrier may not rebroker, co-broker, assign, or transfer the shipment
                without Hello Hotshot&rsquo;s prior written approval.
              </li>
              <li>Carrier is responsible for safeguarding the freight while in its possession.</li>
              <li>Carrier must obtain and submit a signed POD with its invoice.</li>
              <li>
                Detention, layover, lumper reimbursement, TONU, and other accessorial
                charges require prior written approval.
              </li>
              <li>
                This Rate Confirmation and the parties&rsquo; written broker-carrier
                agreement govern this shipment and carrier compensation.
              </li>
            </ol>
          </section>

          <section className="rc-section">
            <TextAreaField
              label="Additional Shipment-Specific Terms"
              name="additional_terms"
              rows={3}
            />
          </section>

          <section className="rc-section rc-sig-block">
            <SectionHeading>Carrier Acceptance</SectionHeading>
            <p className="rc-sig-statement">
              By signing below, Carrier confirms acceptance of this load, the total
              carrier pay, and the terms in this Rate Confirmation.
            </p>
            <div className="rc-sig-row">
              <Field label="Carrier Legal Name" name="sig_carrier_legal_name" />
              <Field
                label="Authorized Representative (Printed)"
                name="sig_carrier_rep_printed"
              />
            </div>
            <div className="rc-sig-row">
              <div>
                <div className="rc-sig-line" />
                <span className="rc-sig-line-label">Signature</span>
              </div>
              <Field label="Date & Time Signed" name="sig_carrier_datetime" />
            </div>
          </section>

          <section className="rc-section rc-sig-block">
            <SectionHeading>Broker Acknowledgment (Optional)</SectionHeading>
            <div className="rc-sig-row">
              <Field
                label="Broker Representative (Printed)"
                name="sig_broker_rep_printed"
              />
              <Field label="Date & Time" name="sig_broker_datetime" />
            </div>
            <div className="rc-sig-row">
              <div>
                <div className="rc-sig-line" />
                <span className="rc-sig-line-label">Signature</span>
              </div>
              <div />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="rc-heading-row">
      <h2 className="rc-heading">{children}</h2>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="rc-field">
      <span className="rc-field-label">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder ?? `[${label}]`}
        className="rc-input"
      />
    </label>
  );
}

/** Controlled counterpart to Field, for the handful of fields (broker
 * contact/phone/email) driven by the Broker Contact dropdown's auto-fill —
 * every other field on this doc stays an uncontrolled defaultValue input. */
function ControlledField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="rc-field">
      <span className="rc-field-label">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `[${label}]`}
        className="rc-input"
      />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  rows = 2,
}: {
  label: string;
  name: string;
  rows?: number;
}) {
  return (
    <label className="rc-field">
      <span className="rc-field-label">{label}</span>
      <textarea
        name={name}
        rows={rows}
        placeholder={`[${label}]`}
        className="rc-textarea"
      />
    </label>
  );
}
