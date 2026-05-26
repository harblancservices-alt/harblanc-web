import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { company } from "@/lib/company";

/**
 * Straight Bill of Lading — internal dispatch / driver packet PDF.
 *
 * Print-document twin of the BOL email rendered by
 * src/lib/email/bill-of-lading.ts. Where the email is operational
 * notification, this PDF is the legal-instrument document that rides
 * with the freight: signed by shipper at pickup, by driver at handoff,
 * by consignee at delivery.
 *
 * Document order — standard Straight BOL conventions:
 *   1. Header bar — HARBLANC lockup + "STRAIGHT BILL OF LADING"
 *      doctype
 *   2. Meta strip — BOL # / Dispatch ref / Rate confirmation # /
 *      Issued date
 *   3. Carrier block — USDOT / MC / authority / dispatch contact
 *   4. Shipper / Consignee side-by-side two-column blocks
 *   5. Pickup / Delivery window strip
 *   6. Freight description grid — Quantity / Handling units /
 *      Commodity / Weight / NMFC / Class / Dimensions
 *   7. Operational handling checkbox row — Hazmat / Driver assist /
 *      Tarp / Permits / Escort / Rigging / Appointment
 *   8. Special handling block (only when present)
 *   9. Dispatch notes block (only when present)
 *  10. Signature panel — Shipper / Driver / Consignee with date lines
 *  11. Fixed footer — authority + dispatch contact, repeats per page
 *
 * Generated on demand by the admin GET route in
 *   src/app/admin/(authed)/quotes/[id]/bol-pdf/[bolId]/route.ts.
 * Not attached to email sends — email pipeline stays untouched in
 * Phase 3A, same posture as Finalized Quote PDF in Phase 2C.
 */

const LOGO_URL = `${
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com"
}/brand/harblanc-pro.png`;

// ─── Data shape ──────────────────────────────────────────────────────────
//
// Mirrors the email's BolPayload structure but flattened for print.
// Caller (the route handler) builds this from the BOL row + lead +
// any cross-references — no business logic in the renderer.

export type BillOfLadingPdfData = {
  bolNumber: string;                   // "BOL-2026-0042"
  dispatchReference: string | null;    // "HS-A4F2-9B1C"
  finalizedQuoteNumber: string | null; // "RC-2026-0042" (cross-ref)
  issueDate: string;                   // YYYY-MM-DD

  shipper: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    pickupWindow: string | null;
    pickupInstructions: string | null;
  };

  consignee: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    deliveryWindow: string | null;
    deliveryInstructions: string | null;
  };

  freight: {
    commodity: string | null;
    quantity: number | null;
    handlingUnitsType: string | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
    weightLbs: number | null;
    nmfcCode: string | null;
    freightClass: string | null;
    hazmat: boolean;
    specialHandling: string | null;
  };

  ops: {
    driverAssistRequired: boolean;
    tarpRequired: boolean;
    permitsRequired: boolean;
    escortRequired: boolean;
    riggingRequired: boolean;
    appointmentRequired: boolean;
    specialInstructions: string | null;
  };

  dispatchNotes: string | null;
  preparedBy: string | null;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000",
    backgroundColor: "#fff",
    paddingTop: 32,
    paddingHorizontal: 32,
    paddingBottom: 56,
  },
  // ── Header bar ─────────────────────────────────────────
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
    paddingBottom: 8,
    marginBottom: 10,
  },
  logoLockup: { width: 146, height: 49 },
  docType: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    letterSpacing: 2.5,
    textAlign: "right",
  },
  docTypeMain: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    letterSpacing: 3,
  },
  docTypeAccent: { color: "#dc2626" },
  // ── Meta strip ─────────────────────────────────────────
  metaStrip: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#f3f3f3",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  metaCell: { flex: 1, flexDirection: "column" },
  metaLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
  },
  metaValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginTop: 2,
  },
  metaValueAccent: { color: "#dc2626" },
  // ── Carrier block ─────────────────────────────────────
  carrierBlock: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#fafafa",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
    alignItems: "center",
  },
  carrierLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
    marginRight: 6,
  },
  carrierName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginRight: 12,
  },
  carrierAuthority: {
    fontSize: 9,
    color: "#000",
    flex: 1,
  },
  carrierContact: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  // ── Section header band ────────────────────────────────
  sectionBand: {
    backgroundColor: "#000",
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  redBar: {
    width: 3,
    height: 9,
    backgroundColor: "#dc2626",
    marginRight: 6,
  },
  sectionBandText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 2,
    color: "#fff",
  },
  // ── Shipper / Consignee two-column ─────────────────────
  twoCol: {
    flexDirection: "row",
    marginBottom: 10,
  },
  twoColCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    padding: 8,
  },
  twoColCellRight: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    borderLeftWidth: 0,
    padding: 8,
  },
  partyLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 3,
  },
  partyCompany: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 2,
  },
  partyLine: { fontSize: 9, lineHeight: 1.35 },
  partyDivider: {
    borderTopWidth: 0.5,
    borderTopColor: "#d4d4d8",
    marginVertical: 5,
  },
  partyContactLabel: {
    fontSize: 6.5,
    letterSpacing: 1.2,
    color: "#444",
    marginBottom: 1,
  },
  partyContactValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  // ── Window strip ───────────────────────────────────────
  windowStrip: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#fafafa",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  windowCell: {
    flex: 1,
    flexDirection: "column",
  },
  windowCellRight: {
    flex: 1,
    flexDirection: "column",
    paddingLeft: 12,
    borderLeftWidth: 0.5,
    borderLeftColor: "#d4d4d8",
  },
  // ── Freight grid ──────────────────────────────────────
  freightGridHeader: {
    flexDirection: "row",
    backgroundColor: "#e5e5e5",
    borderWidth: 0.5,
    borderColor: "#000",
    borderBottomWidth: 0,
  },
  freightGridHeaderCell: {
    padding: 5,
    borderRightWidth: 0.5,
    borderRightColor: "#000",
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 1.2,
    color: "#000",
  },
  freightGridRow: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#000",
    // Bumped from 28 → 34 so the data row has the vertical air of real
    // BOL paperwork. Commodity descriptions are typically long; the
    // extra height keeps the row from looking cramped against the
    // header row above.
    minHeight: 34,
    marginBottom: 10,
  },
  freightGridCell: {
    // Bumped padding 6 → 7 to match the breathing room of the
    // shipper/consignee cells. Small change but reads cleaner on print.
    padding: 7,
    borderRightWidth: 0.5,
    borderRightColor: "#000",
    justifyContent: "center",
  },
  freightGridText: { fontSize: 10 },
  freightGridTextBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  // Column widths (sum to ~100): QTY 8, UNITS 10, COMMODITY 38,
  // WEIGHT 12, NMFC 12, CLASS 8, DIMS 12
  colQty: { width: "8%" },
  colUnits: { width: "10%" },
  colCommodity: { width: "38%" },
  colWeight: { width: "12%" },
  colNmfc: { width: "12%" },
  colClass: { width: "8%" },
  colDims: { width: "12%" },
  // ── Ops checkbox grid ─────────────────────────────────
  opsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    marginTop: -10,
    marginBottom: 10,
  },
  opsCell: {
    width: "25%",
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    borderRightWidth: 0.5,
    borderTopWidth: 0.5,
    borderColor: "#d4d4d8",
  },
  checkbox: {
    width: 9,
    height: 9,
    borderWidth: 0.5,
    borderColor: "#000",
    marginRight: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    width: 9,
    height: 9,
    borderWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#000",
    marginRight: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginTop: -1,
  },
  opsLabel: {
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  opsLabelHazmatChecked: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#dc2626",
  },
  // When hazmat is checked, the entire ops cell carries a thick black
  // left bar so it's unmistakable even on a black-and-white laser
  // printer where the red label prints as mid-gray. Print-safety
  // first.
  opsCellHazmat: {
    width: "25%",
    flexDirection: "row",
    alignItems: "center",
    padding: 5,
    borderRightWidth: 0.5,
    borderTopWidth: 0.5,
    borderLeftWidth: 2,
    borderRightColor: "#d4d4d8",
    borderTopColor: "#d4d4d8",
    borderLeftColor: "#000",
  },
  // Hazmat emergency-contact strip below the ops grid — required
  // operational signal on shipping papers carrying hazardous material.
  // Carries the dispatch number as the 24-hour emergency contact;
  // appropriate for the carrier's scope at this scale.
  hazmatStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 2,
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#fafafa",
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: -10,
    marginBottom: 10,
    gap: 6,
  },
  hazmatBadge: {
    backgroundColor: "#000",
    color: "#fff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.5,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  hazmatStripText: {
    fontSize: 8.5,
    color: "#000",
    flex: 1,
  },
  hazmatStripContact: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  // ── Notes block ───────────────────────────────────────
  notesBlock: {
    borderWidth: 0.5,
    borderColor: "#000",
    padding: 10,
    marginBottom: 10,
  },
  // Special-handling block carries a red 3pt left bar matching the
  // operational section bands — this is the freight-document signal
  // that "the driver and shipper need to read this before handoff."
  // Same accent as inverted-black section bands so the document reads
  // as one consistent freight system, not loose notes.
  notesBlockEmphasized: {
    borderWidth: 0.5,
    borderLeftWidth: 3,
    borderColor: "#000",
    borderLeftColor: "#dc2626",
    padding: 10,
    marginBottom: 10,
  },
  notesLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 5,
  },
  notesBody: { fontSize: 10, lineHeight: 1.4 },
  // ── Signature panel ───────────────────────────────────
  //
  // The whole sigPanel View is rendered with wrap={false} in the JSX
  // so the three signature cells can never split across a page break —
  // signatures must always stay together as one atomic block.
  sigPanel: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 12,
  },
  sigCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#000",
    padding: 8,
    marginRight: 6,
  },
  sigCellLast: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#000",
    padding: 8,
  },
  sigLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 24,
  },
  // Signature line — thicker than the printed-name line so the
  // operator/driver/shipper sees clearly which one is the actual
  // signature surface.
  sigLine: {
    borderTopWidth: 0.75,
    borderTopColor: "#000",
    paddingTop: 3,
    marginBottom: 14,
  },
  // Printed name line — distinct from the signature, sits below it.
  printedNameLine: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    paddingTop: 3,
    marginBottom: 10,
  },
  sigSubLabel: {
    fontSize: 6.5,
    letterSpacing: 1,
    color: "#444",
  },
  // Date + Time row — two short fields side-by-side at the bottom of
  // each signature cell. DATE takes ~60% width, TIME the rest so DATE
  // (the more important freight field) reads first.
  sigDateTimeRow: {
    flexDirection: "row",
    gap: 8,
  },
  sigDateCell: { width: "60%" },
  sigTimeCell: { flex: 1 },
  sigDateLine: {
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    paddingTop: 3,
  },
  // ── Footer ────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 22,
    left: 32,
    right: 32,
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerCell: { flex: 1 },
  footerLabel: {
    fontSize: 6,
    letterSpacing: 1.5,
    color: "#666",
  },
  footerValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    marginTop: 1,
  },
});

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
  }
  return iso;
}

function joinPartyAddress(
  loc:
    | BillOfLadingPdfData["shipper"]
    | BillOfLadingPdfData["consignee"],
): string[] {
  const lines: string[] = [];
  if (loc.addressLine1) lines.push(loc.addressLine1);
  if (loc.addressLine2) lines.push(loc.addressLine2);
  const cs: string[] = [];
  if (loc.city) cs.push(loc.city);
  if (loc.state) cs.push(loc.state);
  let line3 = cs.join(", ");
  if (loc.zip) line3 = line3 ? `${line3} ${loc.zip}` : loc.zip;
  if (line3) lines.push(line3);
  return lines;
}

function formatDimensions(f: BillOfLadingPdfData["freight"]): string {
  const parts: string[] = [];
  if (f.lengthIn !== null) parts.push(`${f.lengthIn}"L`);
  if (f.widthIn !== null) parts.push(`${f.widthIn}"W`);
  if (f.heightIn !== null) parts.push(`${f.heightIn}"H`);
  return parts.join(" × ");
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={checked ? styles.checkboxChecked : styles.checkbox}>
      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
    </View>
  );
}

/**
 * One cell of the BOL signature panel — Shipper / Driver / Consignee.
 * Renders a labeled header + signature line + printed-name line +
 * date/time row. Each line is a flat horizontal rule with a small
 * sub-label below so the signer knows what each line is for. Standard
 * freight-document shape, suitable for clipboard signing in the field.
 */
function SigCell({
  label,
  isLast,
}: {
  label: string;
  /** When true, render with styles.sigCellLast (no right margin) so the
   *  final signature cell sits flush against the panel edge. Otherwise
   *  uses styles.sigCell which carries the inter-cell right margin. */
  isLast?: boolean;
}) {
  return (
    <View style={isLast ? styles.sigCellLast : styles.sigCell}>
      <Text style={styles.sigLabel}>{label}</Text>
      <View style={styles.sigLine}>
        <Text style={styles.sigSubLabel}>Signature</Text>
      </View>
      <View style={styles.printedNameLine}>
        <Text style={styles.sigSubLabel}>Printed name</Text>
      </View>
      <View style={styles.sigDateTimeRow}>
        <View style={styles.sigDateCell}>
          <View style={styles.sigDateLine}>
            <Text style={styles.sigSubLabel}>Date</Text>
          </View>
        </View>
        <View style={styles.sigTimeCell}>
          <View style={styles.sigDateLine}>
            <Text style={styles.sigSubLabel}>Time</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function BillOfLadingPDF({ data }: { data: BillOfLadingPdfData }) {
  const shipperLines = joinPartyAddress(data.shipper);
  const consigneeLines = joinPartyAddress(data.consignee);
  const dims = formatDimensions(data.freight);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header bar — HARBLANC lockup + STRAIGHT BILL OF LADING */}
        <View style={styles.headerBar}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image accepts no alt prop */}
          <Image src={LOGO_URL} style={styles.logoLockup} />
          <View>
            <Text style={styles.docType}>STRAIGHT</Text>
            <Text style={styles.docTypeMain}>
              BILL OF <Text style={styles.docTypeAccent}>LADING</Text>
            </Text>
          </View>
        </View>

        {/* Meta strip — BOL # / Dispatch ref / RC # / Issued */}
        <View style={styles.metaStrip}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>BOL #</Text>
            <Text style={[styles.metaValue, styles.metaValueAccent]}>
              {data.bolNumber}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>DISPATCH REF</Text>
            <Text style={styles.metaValue}>
              {data.dispatchReference ?? "—"}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>RATE CONFIRMATION #</Text>
            <Text style={styles.metaValue}>
              {data.finalizedQuoteNumber ?? "—"}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>ISSUED</Text>
            <Text style={styles.metaValue}>{dateOnly(data.issueDate)}</Text>
          </View>
        </View>

        {/* Carrier block */}
        <View style={styles.carrierBlock}>
          <Text style={styles.carrierLabel}>CARRIER</Text>
          <Text style={styles.carrierName}>{company.legalName}</Text>
          <Text style={styles.carrierAuthority}>
            USDOT {company.dotNumber} · MC {company.mcNumber} ·{" "}
            {company.authorityText}
          </Text>
          <Text style={styles.carrierContact}>
            {company.dispatchPhone}
          </Text>
        </View>

        {/* Shipper / Consignee bands */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>SHIPPER / CONSIGNEE</Text>
        </View>
        <View style={styles.twoCol}>
          <View style={styles.twoColCell}>
            <Text style={styles.partyLabel}>SHIPPER</Text>
            <Text style={styles.partyCompany}>
              {data.shipper.company ?? "—"}
            </Text>
            {shipperLines.map((line, i) => (
              <Text key={i} style={styles.partyLine}>
                {line}
              </Text>
            ))}
            {data.shipper.contactName || data.shipper.contactPhone ? (
              <View>
                <View style={styles.partyDivider} />
                {data.shipper.contactName ? (
                  <Text style={styles.partyContactValue}>
                    {data.shipper.contactName}
                  </Text>
                ) : null}
                {data.shipper.contactPhone ? (
                  <Text style={styles.partyLine}>
                    {data.shipper.contactPhone}
                  </Text>
                ) : null}
                {data.shipper.contactEmail ? (
                  <Text style={styles.partyLine}>
                    {data.shipper.contactEmail}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.twoColCellRight}>
            <Text style={styles.partyLabel}>CONSIGNEE</Text>
            <Text style={styles.partyCompany}>
              {data.consignee.company ?? "—"}
            </Text>
            {consigneeLines.map((line, i) => (
              <Text key={i} style={styles.partyLine}>
                {line}
              </Text>
            ))}
            {data.consignee.contactName || data.consignee.contactPhone ? (
              <View>
                <View style={styles.partyDivider} />
                {data.consignee.contactName ? (
                  <Text style={styles.partyContactValue}>
                    {data.consignee.contactName}
                  </Text>
                ) : null}
                {data.consignee.contactPhone ? (
                  <Text style={styles.partyLine}>
                    {data.consignee.contactPhone}
                  </Text>
                ) : null}
                {data.consignee.contactEmail ? (
                  <Text style={styles.partyLine}>
                    {data.consignee.contactEmail}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* Window strip — pickup + delivery */}
        <View style={styles.windowStrip}>
          <View style={styles.windowCell}>
            <Text style={styles.metaLabel}>PICKUP WINDOW</Text>
            <Text style={styles.metaValue}>
              {data.shipper.pickupWindow ?? "—"}
            </Text>
          </View>
          <View style={styles.windowCellRight}>
            <Text style={styles.metaLabel}>DELIVERY WINDOW</Text>
            <Text style={styles.metaValue}>
              {data.consignee.deliveryWindow ?? "—"}
            </Text>
          </View>
        </View>

        {/* Freight description band */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>FREIGHT DESCRIPTION</Text>
        </View>
        <View style={styles.freightGridHeader}>
          <Text style={[styles.freightGridHeaderCell, styles.colQty]}>
            QTY
          </Text>
          <Text style={[styles.freightGridHeaderCell, styles.colUnits]}>
            UNITS
          </Text>
          <Text style={[styles.freightGridHeaderCell, styles.colCommodity]}>
            COMMODITY
          </Text>
          <Text style={[styles.freightGridHeaderCell, styles.colWeight]}>
            WEIGHT
          </Text>
          <Text style={[styles.freightGridHeaderCell, styles.colNmfc]}>
            NMFC
          </Text>
          <Text style={[styles.freightGridHeaderCell, styles.colClass]}>
            CLASS
          </Text>
          <Text
            style={[
              styles.freightGridHeaderCell,
              styles.colDims,
              { borderRightWidth: 0 },
            ]}
          >
            DIMS (L×W×H)
          </Text>
        </View>
        <View style={styles.freightGridRow}>
          <View style={[styles.freightGridCell, styles.colQty]}>
            <Text style={styles.freightGridTextBold}>
              {data.freight.quantity !== null
                ? String(data.freight.quantity)
                : "—"}
            </Text>
          </View>
          <View style={[styles.freightGridCell, styles.colUnits]}>
            <Text style={styles.freightGridText}>
              {data.freight.handlingUnitsType ?? "—"}
            </Text>
          </View>
          <View style={[styles.freightGridCell, styles.colCommodity]}>
            <Text style={styles.freightGridTextBold}>
              {data.freight.commodity ?? "—"}
            </Text>
          </View>
          <View style={[styles.freightGridCell, styles.colWeight]}>
            <Text style={styles.freightGridTextBold}>
              {data.freight.weightLbs
                ? `${data.freight.weightLbs.toLocaleString()} lbs`
                : "—"}
            </Text>
          </View>
          <View style={[styles.freightGridCell, styles.colNmfc]}>
            <Text style={styles.freightGridText}>
              {data.freight.nmfcCode ?? "—"}
            </Text>
          </View>
          <View style={[styles.freightGridCell, styles.colClass]}>
            <Text style={styles.freightGridTextBold}>
              {data.freight.freightClass ?? "—"}
            </Text>
          </View>
          <View
            style={[
              styles.freightGridCell,
              styles.colDims,
              { borderRightWidth: 0 },
            ]}
          >
            <Text style={styles.freightGridText}>{dims || "—"}</Text>
          </View>
        </View>

        {/* Operational checkbox grid — driver-visible handling flags.
            Hazmat carries a thick black left border when checked so the
            indicator survives B&W laser printing where red prints as
            mid-gray and could be missed. */}
        <View style={styles.opsGrid}>
          <View
            style={
              data.freight.hazmat ? styles.opsCellHazmat : styles.opsCell
            }
          >
            <Checkbox checked={data.freight.hazmat} />
            <Text
              style={
                data.freight.hazmat
                  ? styles.opsLabelHazmatChecked
                  : styles.opsLabel
              }
            >
              {data.freight.hazmat ? "HAZMAT" : "Hazmat"}
            </Text>
          </View>
          <View style={styles.opsCell}>
            <Checkbox checked={data.ops.driverAssistRequired} />
            <Text style={styles.opsLabel}>Driver assist</Text>
          </View>
          <View style={styles.opsCell}>
            <Checkbox checked={data.ops.tarpRequired} />
            <Text style={styles.opsLabel}>Tarp required</Text>
          </View>
          <View style={styles.opsCell}>
            <Checkbox checked={data.ops.permitsRequired} />
            <Text style={styles.opsLabel}>Permits</Text>
          </View>
          <View style={styles.opsCell}>
            <Checkbox checked={data.ops.escortRequired} />
            <Text style={styles.opsLabel}>Escort</Text>
          </View>
          <View style={styles.opsCell}>
            <Checkbox checked={data.ops.riggingRequired} />
            <Text style={styles.opsLabel}>Rigging / crane</Text>
          </View>
          <View style={styles.opsCell}>
            <Checkbox checked={data.ops.appointmentRequired} />
            <Text style={styles.opsLabel}>Appointment</Text>
          </View>
          {/* Empty 8th cell so the 4-up grid renders cleanly */}
          <View style={styles.opsCell} />
        </View>

        {/* Hazmat emergency-contact strip — appears only when hazmat
            is checked. Real BOLs carrying hazmat freight carry a 24-
            hour emergency contact (49 CFR 172.604). Uses the carrier's
            dispatch line as the operational contact at this carrier's
            scope; if a dedicated emergency-response service is added
            later, swap company.dispatchPhone for that number here. */}
        {data.freight.hazmat ? (
          <View style={styles.hazmatStrip}>
            <Text style={styles.hazmatBadge}>HAZMAT</Text>
            <Text style={styles.hazmatStripText}>
              Hazardous material — driver must carry shipping papers.
              Emergency contact{" "}
              <Text style={styles.hazmatStripContact}>
                {company.dispatchPhone}
              </Text>
              .
            </Text>
          </View>
        ) : null}

        {/* Special handling block — only when present. Emphasized
            chrome (red 3pt left bar) so it stands out as the
            driver/shipper handoff signal, not buried with general
            notes. */}
        {data.freight.specialHandling ? (
          <View style={styles.notesBlockEmphasized}>
            <Text style={styles.notesLabel}>SPECIAL HANDLING</Text>
            <Text style={styles.notesBody}>{data.freight.specialHandling}</Text>
          </View>
        ) : null}

        {/* Pickup / delivery instructions — only when present */}
        {(data.shipper.pickupInstructions ||
          data.consignee.deliveryInstructions) ? (
          <View style={styles.notesBlock}>
            {data.shipper.pickupInstructions ? (
              <View style={{ marginBottom: 6 }}>
                <Text style={styles.notesLabel}>PICKUP INSTRUCTIONS</Text>
                <Text style={styles.notesBody}>
                  {data.shipper.pickupInstructions}
                </Text>
              </View>
            ) : null}
            {data.consignee.deliveryInstructions ? (
              <View>
                <Text style={styles.notesLabel}>DELIVERY INSTRUCTIONS</Text>
                <Text style={styles.notesBody}>
                  {data.consignee.deliveryInstructions}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Special / dispatch instructions — only when present */}
        {data.ops.specialInstructions ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>SPECIAL INSTRUCTIONS</Text>
            <Text style={styles.notesBody}>{data.ops.specialInstructions}</Text>
          </View>
        ) : null}

        {/* Dispatch notes — only when present */}
        {data.dispatchNotes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>DISPATCH NOTES</Text>
            <Text style={styles.notesBody}>{data.dispatchNotes}</Text>
          </View>
        ) : null}

        {/* Signature panel — Shipper / Driver / Consignee.
            wrap={false} keeps the three cells together so they never
            split across a page break — signatures must stay atomic
            for the document to be operationally usable. */}
        <View style={styles.sectionBand} wrap={false}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>SIGNATURES</Text>
        </View>
        <View style={styles.sigPanel} wrap={false}>
          <SigCell label="SHIPPER — RELEASED IN GOOD ORDER" />
          <SigCell label="DRIVER — RECEIVED FREIGHT" />
          <SigCell
            label="CONSIGNEE — RECEIVED IN GOOD ORDER"
            isLast
          />
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>AUTHORITY</Text>
            <Text style={styles.footerValue}>
              {company.dot} · {company.mc}
            </Text>
          </View>
          <View style={styles.footerCell}>
            <Text style={[styles.footerLabel, { textAlign: "center" }]}>
              DISPATCH
            </Text>
            <Text style={[styles.footerValue, { textAlign: "center" }]}>
              {company.dispatchPhone}
            </Text>
          </View>
          <View style={styles.footerCell}>
            <Text style={[styles.footerLabel, { textAlign: "right" }]}>
              EMAIL
            </Text>
            <Text style={[styles.footerValue, { textAlign: "right" }]}>
              {company.dispatchEmail}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
