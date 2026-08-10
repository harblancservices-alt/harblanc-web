import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { disablePdfHyphenation, splitAddress, properCaseAddressLine, formatPhone } from "./textFormat";

disablePdfHyphenation();

/**
 * Server-rendered twin of the fillable /crm/bill-of-lading print doc
 * (BillOfLadingGenerator.tsx's BolDocument) — same grayscale letterhead,
 * black-bordered Ship From/To/Carrier boxes, and full-black-grid line-item
 * table, but driven from a shipment's Bill of Lading record instead of an
 * uncontrolled form. Generated once per generateBol() call from an
 * immutable snapshot of the shipment + carrier + broker profile + line
 * items at that moment (see shipments/bol-actions.ts) — this component
 * never reads live data itself. NOT the same component as CrmBolPDF.tsx
 * (the account-profile quick BOL, which has no shipment/carrier source) or
 * BillOfLadingPDF.tsx (the tms-v2 dispatch document).
 */
export type CrmShipmentBolPdfData = {
  bolNumber: string;
  date: string;
  loadRef: string | null;
  broker: {
    name: string;
    mc: string;
    dot: string;
    address: string;
    phone: string;
    email: string;
  };
  shipper: PartyInfo;
  consignee: PartyInfo;
  poNumber: string | null;
  refNumbers: string | null;
  carrier: {
    name: string | null;
    mc: string | null;
    dot: string | null;
    truckNumber: string | null;
    trailerNumber: string | null;
  };
  freightChargeTerms: string | null;
  specialInstructions: string | null;
  lineItems: {
    qty: string | null;
    unitType: string | null;
    description: string | null;
    weight: string | null;
    freightClass: string | null;
    hazmat: boolean;
  }[];
  codAmount: number | null;
  declaredValue: string | null;
};

type PartyInfo = {
  name: string | null;
  address: string | null;
  cityStateZip: string | null;
  contact: string | null;
  phone: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1.5pt solid #000",
    paddingBottom: 8,
    marginBottom: 10,
  },
  wordmark: { fontSize: 15, fontWeight: 700 },
  brokerLine: { fontSize: 8.5, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 14, fontWeight: 700 },
  docSubtitle: { fontSize: 7.5, color: "#444", marginTop: 1, marginBottom: 4 },
  headerLine: { fontSize: 8.5, marginTop: 1 },
  section: { marginTop: 8 },
  cols2: { flexDirection: "row", gap: 16 },
  col: { flex: 1 },
  boxSolid: { border: "1.5pt solid #000", padding: 7 },
  heading: {
    fontSize: 8.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    borderBottom: "1pt solid #000",
    paddingBottom: 2,
    marginBottom: 4,
  },
  /** Same as `heading` but without the underline — used above the Ship
   * From/Ship To boxes, where the border read as a stray line sitting right
   * on top of the box. */
  headingNoBorder: {
    fontSize: 8.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  fieldLine: { fontSize: 9, marginBottom: 1 },
  fieldLabel: { fontSize: 7, fontWeight: 600, color: "#555", textTransform: "uppercase" },
  chargeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    border: "1.5pt solid #000",
    padding: "4 8",
  },
  chargeLabel: { fontSize: 8, fontWeight: 700, textTransform: "uppercase" },
  checkOption: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 4 },
  checkbox: {
    width: 9,
    height: 9,
    border: "1pt solid #000",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { fontSize: 7, fontWeight: 700 },
  checkLabel: { fontSize: 8.5 },
  table: { border: "1pt solid #000", marginTop: 4 },
  tableHeaderRow: { flexDirection: "row" },
  tableHeaderCell: {
    fontSize: 7,
    fontWeight: 700,
    color: "#444",
    textTransform: "uppercase",
    padding: 4,
    borderRight: "1pt solid #000",
    borderBottom: "1pt solid #000",
  },
  tableRow: { flexDirection: "row" },
  tableCell: {
    fontSize: 8.5,
    padding: 4,
    borderRight: "1pt solid #000",
    borderBottom: "1pt solid #000",
  },
  totalRow: { flexDirection: "row" },
  totalCell: {
    fontSize: 8.5,
    fontWeight: 700,
    padding: 4,
    borderRight: "1pt solid #000",
    borderTop: "2pt solid #000",
  },
  colDesc: { width: "40%" },
  colQty: { width: "12%", textAlign: "center" },
  colWeight: { width: "12%", textAlign: "center" },
  colClass: { width: "12%", textAlign: "center" },
  colHazmat: { width: "12%", textAlign: "center" },
  colUnit: { width: "12%", textAlign: "center" },
  codLine: { fontSize: 8.5, marginBottom: 3 },
  notice: { fontSize: 7.5, fontStyle: "italic", color: "#333", lineHeight: 1.35 },
  cert: { borderTop: "1pt solid #d0d0d0", paddingTop: 5, marginTop: 8 },
  certText: { fontSize: 7.5, lineHeight: 1.3, color: "#222", marginBottom: 4 },
  sigRow: {
    flexDirection: "row",
    gap: 18,
    borderTop: "1pt solid #d0d0d0",
    paddingTop: 6,
    marginTop: 8,
  },
  sigCol: { flex: 1 },
  sigLine: { borderBottom: "1pt solid #bdbdbd", minHeight: 20 },
  sigLabel: { fontSize: 7, fontWeight: 600, color: "#555", textTransform: "uppercase", marginTop: 2 },
  sigDate: { fontSize: 8.5, marginTop: 3 },
});

function PartyBox({
  title,
  party,
  poNumber,
  refNumbers,
}: {
  title: string;
  party: PartyInfo;
  poNumber: string | null;
  refNumbers: string | null;
}) {
  return (
    <View style={styles.col}>
      <Text style={styles.headingNoBorder}>{title}</Text>
      <View style={styles.boxSolid}>
        <Text style={styles.fieldLine}>{party.name || "—"}</Text>
        <Text style={styles.fieldLine}>{party.address || "—"}</Text>
        <Text style={styles.fieldLine}>{party.cityStateZip || "—"}</Text>
        <View style={styles.cols2}>
          <Text style={[styles.fieldLine, { flex: 1 }]}>PO Number: {poNumber || "—"}</Text>
          <Text style={[styles.fieldLine, { flex: 1 }]}>Reference Number: {refNumbers || "—"}</Text>
        </View>
        <View style={styles.cols2}>
          <Text style={[styles.fieldLine, { flex: 1 }]}>
            {[party.contact, formatPhone(party.phone)].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CheckOption({ label, checked }: { label: string; checked: boolean }) {
  return (
    <View style={styles.checkOption}>
      <View style={styles.checkbox}>{checked && <Text style={styles.checkboxMark}>✓</Text>}</View>
      <Text style={styles.checkLabel}>{label}</Text>
    </View>
  );
}

export function CrmShipmentBolPDF({ data }: { data: CrmShipmentBolPdfData }) {
  const totalQty = data.lineItems.reduce((sum, li) => sum + (Number(li.qty) || 0), 0);
  const totalWeight = data.lineItems.reduce((sum, li) => sum + (Number(li.weight) || 0), 0);
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
            <Text style={styles.docTitle}>BILL OF LADING</Text>
            <Text style={styles.docSubtitle}>STRAIGHT BILL OF LADING — NOT NEGOTIABLE</Text>
            <Text style={styles.headerLine}>BOL #: {data.bolNumber}</Text>
            <Text style={styles.headerLine}>Date: {data.date}</Text>
            <Text style={styles.headerLine}>Load / Ref #: {data.loadRef || "—"}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.cols2]}>
          <PartyBox title="Ship From" party={data.shipper} poNumber={data.poNumber} refNumbers={data.refNumbers} />
          <PartyBox title="Ship To" party={data.consignee} poNumber={data.poNumber} refNumbers={data.refNumbers} />
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Carrier</Text>
          <View style={styles.boxSolid}>
            <Text style={styles.fieldLine}>{data.carrier.name || "—"}</Text>
            <View style={styles.cols2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLine}>Truck: {data.carrier.truckNumber || "—"}</Text>
                <Text style={styles.fieldLine}>Trailer: {data.carrier.trailerNumber || "—"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLine}>MC #: {data.carrier.mc || "—"}</Text>
                <Text style={styles.fieldLine}>DOT #: {data.carrier.dot || "—"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Special Instructions</Text>
          <Text style={styles.fieldLine}>{data.specialInstructions || "—"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Customer Order Information</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
              <Text style={[styles.tableHeaderCell, styles.colQty]}># Pkgs</Text>
              <Text style={[styles.tableHeaderCell, styles.colWeight]}>Weight</Text>
              <Text style={[styles.tableHeaderCell, styles.colClass]}>Class</Text>
              <Text style={[styles.tableHeaderCell, styles.colUnit, { borderRight: "none" }]}>Hazmat</Text>
            </View>
            {data.lineItems.map((li, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.colDesc]}>{li.description || "—"}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{li.qty || "—"}</Text>
                <Text style={[styles.tableCell, styles.colWeight]}>{li.weight || "—"}</Text>
                <Text style={[styles.tableCell, styles.colClass]}>{li.freightClass || "—"}</Text>
                <Text style={[styles.tableCell, styles.colUnit, { borderRight: "none" }]}>
                  {li.hazmat ? "Y" : "N"}
                </Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={[styles.totalCell, styles.colDesc]}>GRAND TOTAL</Text>
              <Text style={[styles.totalCell, styles.colQty]}>{totalQty || ""}</Text>
              <Text style={[styles.totalCell, styles.colWeight]}>{totalWeight || ""}</Text>
              <Text style={[styles.totalCell, styles.colClass]} />
              <Text style={[styles.totalCell, styles.colUnit, { borderRight: "none" }]} />
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.cols2]}>
          <View style={styles.col}>
            <Text style={styles.codLine}>
              COD Amount: {data.codAmount !== null ? `$${data.codAmount.toFixed(2)}` : "—"}
            </Text>
            <Text style={styles.codLine}>Agreed / Declared Value: {data.declaredValue || "—"}</Text>
          </View>
          <Text style={[styles.col, styles.notice]}>
            Liability limitation for loss or damage on this shipment may be applicable. See 49
            U.S.C. 14706(c)(1)(A) and (B).
          </Text>
        </View>

        <View style={[styles.section, styles.chargeRow]}>
          <Text style={styles.chargeLabel}>Freight Charge Terms:</Text>
          <CheckOption label="Prepaid" checked={data.freightChargeTerms === "prepaid"} />
          <CheckOption label="Collect" checked={data.freightChargeTerms === "collect"} />
          <CheckOption label="3rd Party" checked={data.freightChargeTerms === "third_party"} />
        </View>

        <View style={styles.cert}>
          <Text style={styles.certText}>
            RECEIVED, subject to individually determined rates or contracts that have been
            agreed upon in writing between the carrier and shipper, if applicable, otherwise to
            the rates, classifications, and rules that have been established by the carrier and
            are available to the shipper on request; and to all applicable state and federal
            regulations.
          </Text>
          <Text style={styles.certText}>
            Shipper Certification: This is to certify that the above-named materials are
            properly classified, described, packaged, marked, and labeled, and are in proper
            condition for transportation according to the applicable regulations of the DOT.
          </Text>
        </View>

        <View style={styles.sigRow} wrap={false}>
          <View style={styles.sigCol}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Shipper Signature</Text>
          </View>
          <View style={styles.sigCol}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Driver Signature</Text>
          </View>
          <View style={styles.sigCol}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Consignee Signature</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
