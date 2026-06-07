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
 * Range Proposal PDF.
 *
 * Print-document twin of the Range Proposal email (src/lib/email/estimate.ts).
 * Same operational paperwork vocabulary as the Finalized Quote PDF
 * (black/white/red, mono-uppercase section bands) — a deliberately simpler
 * layout because a Range proposal carries fewer fields than a Rate
 * Confirmation.
 *
 * Document order:
 *   1. Header bar — HARBLANC lockup + "RANGE PROPOSAL" doctype
 *   2. Meta strip — Reference / Issued / Valid through
 *   3. Prepared For / Prepared By two-column block
 *   4. Lane block — Origin / Destination / Miles
 *   5. Freight section — commodity / weight / pickup window
 *   6. Rate range section — linehaul range + fuel + accessorials + total
 *   7. Notes (only when present)
 *   8. Disclaimer
 *   9. Fixed footer — authority + dispatch contact
 *
 * Generated on demand by the admin GET route at
 * src/app/admin/(authed)/quotes/[id]/estimate-pdf/[estimateId]/route.ts.
 */

const LOGO_URL = `${
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com"
}/brand/harblanc-pro.png`;

export type RangeProposalPdfData = {
  reference: string;            // e.g. "RG-A4F2-9B1C" (last 8 hex of estimate id)
  dispatchReference: string;    // e.g. "HS-A4F2-9B1C" (last 8 hex of lead id)
  issuedAt: string;             // YYYY-MM-DD from sent_at
  expirationAt: string | null;

  customerName: string;
  customerEmail: string | null;

  pickup: {
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  delivery: {
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  miles: number | null;

  freight: {
    commodity: string | null;
    weight: string | null;
    pickupWindow: string | null;
  };

  rate: {
    /** Bottom of the range, always present. */
    linehaulLow: number;
    /** Top of the range; null when the operator sent a single price. */
    linehaulHigh: number | null;
    /** Adds to both low and high when present. */
    fuelSurcharge: number | null;
    /** Each entry adds to both low and high. */
    accessorials: ReadonlyArray<{ label: string; amount: number }>;
  };

  pickupTimingNotes: string | null;
  equipmentNotes: string | null;
  dispatchNotes: string | null;
  closingLine: string | null;

  preparedBy: string | null;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000",
    backgroundColor: "#fff",
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 56,
  },
  // Header
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
    paddingBottom: 8,
    marginBottom: 14,
  },
  logoLockup: { width: 156, height: 52 },
  docType: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    letterSpacing: 3,
  },
  docTypeAccent: { color: "#dc2626" },
  // Meta strip
  metaStrip: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#f3f3f3",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 14,
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
  // Two-col block
  twoCol: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  block: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#000",
    padding: 10,
  },
  blockLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 4,
  },
  blockBodyBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 2,
  },
  blockBody: { fontSize: 10, lineHeight: 1.4 },
  // Section band
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
  // Field grid below a section band
  fieldGrid: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    marginBottom: 14,
  },
  fieldCell: {
    flex: 1,
    padding: 8,
    borderRightWidth: 0.5,
    borderRightColor: "#000",
  },
  fieldCellLast: { flex: 1, padding: 8 },
  fieldLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 3,
  },
  fieldValue: { fontSize: 10 },
  fieldValueBold: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  // Rate table
  rateTable: {
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    marginBottom: 14,
  },
  rateRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  rateLabel: { flex: 1, fontSize: 10 },
  rateAmount: {
    width: 130,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  totalLabel: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "#fff",
  },
  totalAmount: {
    width: 160,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: "#fff",
  },
  // Notes
  notesBlock: {
    borderWidth: 0.5,
    borderColor: "#000",
    padding: 10,
    marginBottom: 14,
  },
  notesLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 5,
  },
  notesBody: { fontSize: 10, lineHeight: 1.4 },
  // Disclaimer
  disclaimer: {
    fontSize: 8,
    color: "#52525b",
    lineHeight: 1.4,
    marginBottom: 14,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: "#000",
    paddingTop: 8,
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

function currency(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function currencyRange(low: number, high: number | null): string {
  if (high === null) return currency(low);
  return `${currency(low)} — ${currency(high)}`;
}

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length >= 3) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function joinCityStateZip(loc: {
  city: string | null;
  state: string | null;
  zip: string | null;
}): string {
  const cs: string[] = [];
  if (loc.city) cs.push(loc.city);
  if (loc.state) cs.push(loc.state);
  let line = cs.join(", ");
  if (loc.zip) line = line ? `${line} ${loc.zip}` : loc.zip;
  return line || "—";
}

export function RangeProposalPDF({ data }: { data: RangeProposalPdfData }) {
  const totals = computeRangeTotals(data.rate);
  const hasBreakdown =
    (data.rate.fuelSurcharge !== null && data.rate.fuelSurcharge > 0) ||
    data.rate.accessorials.length > 0;

  const anyNotes =
    Boolean(data.pickupTimingNotes) ||
    Boolean(data.equipmentNotes) ||
    Boolean(data.dispatchNotes) ||
    Boolean(data.closingLine);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.headerBar}>
          <Image src={LOGO_URL} style={styles.logoLockup} />
          <Text style={styles.docType}>
            RANGE <Text style={styles.docTypeAccent}>PROPOSAL</Text>
          </Text>
        </View>

        {/* Meta strip */}
        <View style={styles.metaStrip}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>REFERENCE</Text>
            <Text style={[styles.metaValue, styles.metaValueAccent]}>
              {data.reference}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>ISSUED</Text>
            <Text style={styles.metaValue}>{dateOnly(data.issuedAt)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>VALID THROUGH</Text>
            <Text style={styles.metaValue}>{dateOnly(data.expirationAt)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>DISPATCH REF</Text>
            <Text style={styles.metaValue}>{data.dispatchReference}</Text>
          </View>
        </View>

        {/* Prepared For / Prepared By */}
        <View style={styles.twoCol}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PREPARED FOR</Text>
            <Text style={styles.blockBodyBold}>{data.customerName || "—"}</Text>
            {data.customerEmail ? (
              <Text style={styles.blockBody}>{data.customerEmail}</Text>
            ) : null}
          </View>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PREPARED BY</Text>
            <Text style={styles.blockBodyBold}>{company.legalName}</Text>
            <Text style={styles.blockBody}>{company.dispatchEmail}</Text>
            <Text style={styles.blockBody}>{company.dispatchPhone}</Text>
            {data.preparedBy ? (
              <Text style={styles.blockBody}>{data.preparedBy}</Text>
            ) : null}
          </View>
        </View>

        {/* Lane */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>LANE</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>ORIGIN</Text>
            <Text style={styles.fieldValueBold}>
              {joinCityStateZip(data.pickup)}
            </Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>DESTINATION</Text>
            <Text style={styles.fieldValueBold}>
              {joinCityStateZip(data.delivery)}
            </Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>DISTANCE</Text>
            <Text style={styles.fieldValueBold}>
              {data.miles != null ? `${data.miles.toLocaleString()} mi` : "—"}
            </Text>
          </View>
        </View>

        {/* Freight */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>FREIGHT</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>COMMODITY</Text>
            <Text style={styles.fieldValue}>{data.freight.commodity || "—"}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>WEIGHT</Text>
            <Text style={styles.fieldValue}>{data.freight.weight || "—"}</Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>PICKUP WINDOW</Text>
            <Text style={styles.fieldValue}>
              {data.freight.pickupWindow || "—"}
            </Text>
          </View>
        </View>

        {/* Rate */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>RATE RANGE</Text>
        </View>
        <View style={styles.rateTable}>
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Linehaul</Text>
            <Text style={styles.rateAmount}>
              {currencyRange(data.rate.linehaulLow, data.rate.linehaulHigh)}
            </Text>
          </View>
          {data.rate.fuelSurcharge !== null && data.rate.fuelSurcharge > 0 ? (
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Fuel surcharge</Text>
              <Text style={styles.rateAmount}>
                {currency(data.rate.fuelSurcharge)}
              </Text>
            </View>
          ) : null}
          {data.rate.accessorials.map((a, i) => (
            <View key={`acc-${i}`} style={styles.rateRow}>
              <Text style={styles.rateLabel}>{a.label}</Text>
              <Text style={styles.rateAmount}>{currency(a.amount)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {hasBreakdown ? "ALL-IN RANGE" : "QUOTED RANGE"}
            </Text>
            <Text style={styles.totalAmount}>
              {currencyRange(totals.low, totals.high)}
            </Text>
          </View>
        </View>

        {/* Notes (combined) */}
        {anyNotes ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>NOTES</Text>
            {data.pickupTimingNotes ? (
              <Text style={styles.notesBody}>
                Pickup timing: {data.pickupTimingNotes}
              </Text>
            ) : null}
            {data.equipmentNotes ? (
              <Text style={styles.notesBody}>
                Equipment: {data.equipmentNotes}
              </Text>
            ) : null}
            {data.dispatchNotes ? (
              <Text style={styles.notesBody}>
                Dispatch: {data.dispatchNotes}
              </Text>
            ) : null}
            {data.closingLine ? (
              <Text style={styles.notesBody}>{data.closingLine}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          This is a non-binding range proposal based on the information available
          at the time of issue. Final rates, fees, and terms will be confirmed
          on the Rate Confirmation issued after pickup details are verified.
          Range valid through the expiration date shown above.
        </Text>

        {/* Fixed footer */}
        <View style={styles.footer} fixed>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>AUTHORITY</Text>
            <Text style={styles.footerValue}>{company.legalName}</Text>
            <Text style={styles.footerValue}>
              {company.dot} · {company.mc}
            </Text>
          </View>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>DISPATCH</Text>
            <Text style={styles.footerValue}>{company.dispatchPhone}</Text>
            <Text style={styles.footerValue}>{company.dispatchEmail}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function computeRangeTotals(rate: RangeProposalPdfData["rate"]): {
  low: number;
  high: number | null;
} {
  const fuel = rate.fuelSurcharge ?? 0;
  const accSum = rate.accessorials.reduce(
    (sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0),
    0,
  );
  const low = rate.linehaulLow + fuel + accSum;
  const high =
    rate.linehaulHigh !== null && rate.linehaulHigh > rate.linehaulLow
      ? rate.linehaulHigh + fuel + accSum
      : null;
  return { low, high };
}
