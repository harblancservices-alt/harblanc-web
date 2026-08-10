import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

// react-pdf's default hyphenation engine treats any long unbroken string —
// an email address, not a real English word — as hyphenatable, and inserts a
// visible "-" at an arbitrary break point when it has to wrap. Disabling it
// means a long token wraps whole (or, failing that, simply doesn't split)
// instead of getting cut off mid-word.
Font.registerHyphenationCallback((word) => [word]);

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
  cityStateZip: string | null;
  contact: string | null;
  phone: string | null;
  window: string | null;
  number: string | null;
  notes: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1pt solid #000",
    paddingBottom: 8,
    marginBottom: 10,
  },
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
  headingTotal: { fontSize: 10.5, fontWeight: 700 },
  grid6: { flexDirection: "row", flexWrap: "wrap" },
  gridCell: { width: "33.33%", marginBottom: 6, paddingRight: 8 },
  gridCellHalf: { width: "50%", marginBottom: 6, paddingRight: 8 },
  gridCellFull: { width: "100%", marginBottom: 6 },
  fieldLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fieldValue: { fontSize: 9.5, marginTop: 1 },
  cols2: { flexDirection: "row", gap: 20 },
  col: { flex: 1 },
  stopLabel: { marginBottom: 4 },
  box: { border: "1pt solid #bdbdbd", padding: 6 },
  rateTable: { marginTop: 4 },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
  },
  rateLabel: { fontSize: 9.5 },
  rateAmount: { fontSize: 9.5 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
    borderBottom: "1pt solid #bdbdbd",
    minHeight: 22,
  },
  sigLineLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
});

function StopBlock({ title, stop }: { title: string; stop: StopInfo }) {
  return (
    <View style={styles.col}>
      <Text style={[styles.heading, styles.stopLabel]}>{title}</Text>
      <View style={styles.box}>
        <Field label="Facility / Company" value={stop.name} />
        <Field label="Address" value={[stop.address, stop.cityStateZip].filter(Boolean).join(", ") || null} />
        <View style={styles.cols2}>
          <Field label="Contact" value={stop.contact} />
          <Field label="Phone" value={stop.phone} />
        </View>
        <View style={styles.cols2}>
          <Field label="Window" value={stop.window} />
          <Field label="Number" value={stop.number} />
        </View>
        <Field label="Notes" value={stop.notes} />
      </View>
    </View>
  );
}

/** "4245 North Central Expressway STE 490, Dallas, TX 75205" -> two display
 * lines. The broker profile stores address as one free-text field (no
 * separate street/city/state/zip columns), so this is a display-only split —
 * the last two comma-separated segments read as "city" and "state zip",
 * everything before that is the street line. */
function splitAddress(address: string): { street: string; cityStateZip: string } {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { street: "", cityStateZip: "" };
  if (parts.length === 1) return { street: parts[0], cityStateZip: "" };
  if (parts.length === 2) return { street: parts[0], cityStateZip: parts[1] };
  return { street: parts.slice(0, -2).join(", "), cityStateZip: parts.slice(-2).join(", ") };
}

/** Title-case every word except a standalone 2-letter state code, which is
 * uppercased instead — so a free-typed "dallas, tx" always prints as
 * "Dallas, TX" regardless of how it was entered in Settings. */
function properCaseAddressLine(value: string): string {
  return value.replace(/[A-Za-z][A-Za-z'-]*/g, (word) =>
    word.length === 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
  );
}

/** US phone -> "972-922-2282". Leaves anything that isn't a clean 10/11-digit
 * US number as-is rather than mangling an already-formatted or foreign value. */
function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return value;
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

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
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
                  <Field label="Dispatcher / Contact" value={data.carrier.contact} />
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
            <Text style={styles.headingTotal}>
              TOTAL CARRIER PAY: ${data.totalCarrierPay.toFixed(2)}
            </Text>
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
              <Text style={styles.totalAmount}>${data.totalCarrierPay.toFixed(2)}</Text>
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
