import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import {
  disablePdfHyphenation,
  splitAddress,
  properCaseAddressLine,
  formatPhone,
  titleCaseName,
  cityStateZip,
  formatDimensionsIn,
} from "./textFormat";
import { getHelloHotshotLogoDataUri } from "./brandLogo";

disablePdfHyphenation();

/**
 * Server-rendered twin of the fillable /crm/rate-confirmation print doc
 * (RateConfirmationDocument.tsx) — same grayscale letterhead/layout, but
 * driven entirely from a shipment's Rate Confirmation record instead of an
 * uncontrolled <input> the rep types into by hand. Generated once per
 * generateRateConfirmation() call from an immutable snapshot of the
 * shipment + carrier + broker profile + lines at that moment (see
 * shipments/rate-confirmation-actions.ts) — this component never reads live
 * data itself.
 */
export type CrmRateConfirmationPdfData = {
  rcNumber: string;
  issuedDate: string;
  broker: {
    name: string;
    mc: string;
    dot: string;
    address: string;
    phone: string;
    email: string;
  };
  shipment: {
    shipmentNumber: string;
    equipment: string | null;
    commodity: string | null;
    weight: string | null;
    pieces: string | null;
    poNumber: string | null;
    refNumbers: string | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
  };
  pickup: StopInfo;
  delivery: StopInfo;
  carrier: {
    name: string | null;
    mc: string | null;
    dot: string | null;
    contact: string | null;
    phone: string | null;
    email: string | null;
  };
  specialInstructions: string | null;
  lines: { label: string; amount: number }[];
  totalCarrierPay: number;
  paymentTerms: string | null;
  quickPay: string | null;
  notes: string | null;
};

type StopInfo = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contact: string | null;
  phone: string | null;
  /** "August 26, 2026". Resolved by the generate action from the shipment's
   * timing model (or its legacy fallback) — see shipments/timing.ts. A stop
   * previously printed a bare window with NO date, which left a carrier
   * unable to tell what day to arrive. */
  dateLabel: string | null;
  /** "Time TBD" | "8:00 AM – 10:00 AM" | "8:30 AM Appointment". Never shown
   * without dateLabel. */
  timeLabel: string | null;
  /** LEGACY free-text window, still carried for shipments that predate the
   * timing model. Only rendered when dateLabel/timeLabel are absent. */
  window: string | null;
  number: string | null;
  notes: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9.5,
    // "CrmSans" (LiberationSans), embedded via embeddedFont.ts's
    // registerCrmSansFont() — not the PDF standard "Helvetica", which is
    // referenced by name only (no glyph data inside the PDF itself) and
    // left pdf.js's rasterizer (used for this doc's Documents-tab card
    // thumbnail) dependent on finding substitute glyph data in the
    // deployed Vercel function, which repeatedly failed silently. See
    // that file's header for the full story.
    fontFamily: "CrmSans",
    color: "#000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1pt solid #000",
    paddingBottom: 8,
    marginBottom: 10,
  },
  brokerBlock: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 74, height: 74 },
  wordmark: { fontSize: 15, fontWeight: 700 },
  brokerLine: { fontSize: 9, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  metaLine: { fontSize: 9, marginTop: 1 },
  section: { marginTop: 9 },
  headingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "1pt solid #000",
    paddingBottom: 2,
    marginBottom: 5,
  },
  heading: { fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 },
  grid6: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  gridCellHalf: { width: "50%", marginBottom: 6, paddingRight: 8 },
  gridCellFull: { width: "100%", marginBottom: 6 },
  fieldLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: "#000",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldValue: { fontSize: 9.5, marginTop: 1 },
  cols2: { flexDirection: "row", gap: 20 },
  col: { flex: 1 },
  stopLabel: { marginBottom: 4 },
  box: { border: "1.2pt solid #000", padding: 6 },
  /* PAIRED BOXES RULE OFF AT THE SAME HEIGHT.
     `cols2` is a flex row, so its two `col` children already stretch to the
     taller of the two. The BOX inside each column did not - it sized to its
     own content, so a Pickup with a wrapping address or a notes line drew a
     deeper box than the Delivery beside it and the two bottom edges did not
     line up. Same fault, same fix as CrmShipmentBolPDF's boxFill (Brent
     flagged it on the BOL first: "fix the box not being parrellel to the
     carrier box. its short. and misaligned"). */
  boxFill: { flexGrow: 1 },
  rateTable: { marginTop: 4 },
  rateRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: 8,
    paddingVertical: 2.5,
  },
  rateLabel: { fontSize: 9.5 },
  rateAmount: { fontSize: 9.5 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: 8,
    borderTop: "1.5pt solid #000",
    paddingTop: 5,
    marginTop: 3,
  },
  totalLabel: { fontSize: 9.5, fontWeight: 700 },
  totalAmount: { fontSize: 9.5, fontWeight: 700 },
  notice: {
    fontSize: 8,
    fontStyle: "italic",
    color: "#333",
    marginTop: 6,
    lineHeight: 1.25,
  },
  sigStatement: { fontSize: 8.5, marginBottom: 8 },
  sigRow: { flexDirection: "row", gap: 24, marginTop: 4 },
  sigBlock: { flex: 1 },
  sigLine: {
    borderBottom: "1.2pt solid #000",
    minHeight: 22,
  },
  sigLineLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: "#000",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
});

function StopBlock({ title, stop }: { title: string; stop: StopInfo }) {
  return (
    <View style={styles.col}>
      <Text style={[styles.heading, styles.stopLabel]}>{title}</Text>
      <View style={[styles.box, styles.boxFill]}>
        <Field label="Facility / Company" value={stop.name} />
        <Field
          label="Address"
          value={[stop.address, cityStateZip(stop.city, stop.state, stop.zip)].filter(Boolean).join(", ") || null}
        />
        <View style={styles.cols2}>
          <Field label="Contact" value={titleCaseName(stop.contact)} />
          <Field label="Phone" value={formatPhone(stop.phone)} />
        </View>
        {/* Date first, and always present when known — a time or window
            without its date is what made earlier RCs undispatchable. */}
        <View style={styles.cols2}>
          <Field label="Date" value={stop.dateLabel} />
          <Field label="Number" value={stop.number} />
        </View>
        {stop.dateLabel ? (
          <Field label="Time" value={stop.timeLabel} />
        ) : (
          <Field label="Window" value={stop.window} />
        )}
        <Field label="Notes" value={stop.notes} />
      </View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "—"}</Text>
    </View>
  );
}

export function CrmRateConfirmationPDF({ data }: { data: CrmRateConfirmationPdfData }) {
  const brokerAddress = splitAddress(data.broker.address);
  const brokerPhone = formatPhone(data.broker.phone);
  const logoSrc = getHelloHotshotLogoDataUri();

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brokerBlock}>
            <Image src={logoSrc} style={styles.logo} />
            <View>
              <Text style={styles.wordmark}>{data.broker.name.toUpperCase() || "—"}</Text>
              {brokerAddress.street && (
                <Text style={styles.brokerLine}>{properCaseAddressLine(brokerAddress.street)}</Text>
              )}
              {brokerAddress.cityStateZip && (
                <Text style={styles.brokerLine}>{properCaseAddressLine(brokerAddress.cityStateZip)}</Text>
              )}
              {brokerPhone && <Text style={styles.brokerLine}>{brokerPhone}</Text>}
              {data.broker.email && <Text style={styles.brokerLine}>{data.broker.email}</Text>}
              <Text style={styles.brokerLine}>
                MC {data.broker.mc || "—"} &nbsp;·&nbsp; DOT {data.broker.dot || "—"}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>RATE CONFIRMATION</Text>
            <Text style={styles.metaLine}>RC #: {data.rcNumber}</Text>
            <Text style={styles.metaLine}>Issued: {data.issuedDate}</Text>
            <Text style={styles.metaLine}>Load #: {data.shipment.shipmentNumber}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.cols2}>
            <View style={styles.col}>
              <View style={styles.headingRow}>
                <Text style={styles.heading}>Load / Commodity</Text>
              </View>
              <View style={styles.grid6}>
                <View style={styles.gridCellHalf}>
                  <Field label="Equipment" value={data.shipment.equipment} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="Commodity" value={data.shipment.commodity} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="Weight" value={data.shipment.weight} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="Pieces / Pallets" value={data.shipment.pieces} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="PO #" value={data.shipment.poNumber} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="Ref #s" value={data.shipment.refNumbers} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field
                    label="Dimensions"
                    value={formatDimensionsIn(data.shipment.lengthIn, data.shipment.widthIn, data.shipment.heightIn)}
                  />
                </View>
              </View>
            </View>

            <View style={styles.col}>
              <View style={styles.headingRow}>
                <Text style={styles.heading}>Carrier</Text>
              </View>
              <View style={styles.grid6}>
                <View style={styles.gridCellHalf}>
                  <Field label="Carrier Legal Name" value={data.carrier.name} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="MC #" value={data.carrier.mc} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="Dispatcher / Contact" value={titleCaseName(data.carrier.contact)} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="DOT #" value={data.carrier.dot} />
                </View>
                <View style={styles.gridCellHalf}>
                  <Field label="Phone" value={formatPhone(data.carrier.phone)} />
                </View>
                <View style={styles.gridCellFull}>
                  <Field label="Email" value={data.carrier.email} />
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.cols2]}>
          <StopBlock title="Pickup" stop={data.pickup} />
          <StopBlock title="Delivery" stop={data.delivery} />
        </View>

        <View style={styles.section}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Special Instructions</Text>
          </View>
          <Text style={styles.fieldValue}>{data.specialInstructions || "—"}</Text>
        </View>

        <View style={styles.section} wrap={false}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Rate &amp; Payment</Text>
          </View>
          <View style={styles.rateTable}>
            {data.lines.map((line, i) => (
              <View key={i} style={styles.rateRow}>
                <Text style={styles.rateLabel}>{line.label}</Text>
                <Text style={styles.rateAmount}>${line.amount.toFixed(2)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL CARRIER PAY</Text>
              {/* No pay lines at all means nobody has entered carrier pay —
                  distinct from a deliberate $0.00. Saying so is honest;
                  printing $0.00 reads as an agreed rate of zero. No value is
                  invented either way. */}
              <Text style={styles.totalAmount}>
                {data.lines.length === 0 ? "NOT ENTERED" : `$${data.totalCarrierPay.toFixed(2)}`}
              </Text>
            </View>
          </View>
          <View style={[styles.cols2, { marginTop: 8 }]}>
            <Field label="Payment Terms" value={data.paymentTerms} />
            <Field label="Quick Pay" value={data.quickPay} />
          </View>
          <Field label="Notes" value={data.notes} />
          <Text style={styles.notice}>
            Signed POD and invoice are required for payment. Accessorial charges require
            prior written broker approval. No double brokering, rebrokering, or unauthorized
            transfer of this shipment.
          </Text>
        </View>

        <View style={styles.section} wrap={false}>
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Carrier Acceptance</Text>
          </View>
          <Text style={styles.sigStatement}>
            By signing below, Carrier confirms acceptance of this load, the total carrier pay,
            and the terms in this Rate Confirmation.
          </Text>
          <View style={styles.sigRow}>
            <View style={styles.sigBlock}>
              <View style={styles.sigLine} />
              <Text style={styles.sigLineLabel}>Carrier Signature</Text>
            </View>
            <View style={styles.sigBlock}>
              <View style={styles.sigLine} />
              <Text style={styles.sigLineLabel}>Date &amp; Time Signed</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
