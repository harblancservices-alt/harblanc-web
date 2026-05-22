import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { company } from "@/lib/company";

/**
 * Premium Carrier Quote PDF — HARBLANC freight document.
 *
 * Visual direction: black on white, sharp borders, mono operational labels,
 * structured panels. No gradients, no soft shadows, no rounded corners.
 * Helvetica is used as the print typeface (built into PDF; no font fetch).
 *
 * v1 uses a typographic header (no embedded logo image) to avoid runtime
 * file-system fragility on Vercel. Logo image embed can be added in v1.1
 * once the asset pipeline is finalised.
 */

export type QuotePdfData = {
  quoteNumber: string;
  issuedAt: string;
  expiresAt: string | null;

  customerName: string | null;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;

  origin: string | null;
  destination: string | null;
  pickupWindow: string | null;
  deliveryWindow: string | null;

  commodity: string | null;
  weightLbs: number | null;
  pieces: number | null;
  equipmentType: string | null;

  linehaul: number | null;
  fuelSurcharge: number | null;
  accessorials: { label: string; amount: number }[];
  totalAmount: number | null;

  paymentTerms: string | null;
  specialInstructions: string | null;
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
  // ── Header ──────────────────────────────────────────────
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#000",
    paddingBottom: 8,
    marginBottom: 14,
  },
  brand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    letterSpacing: 2,
  },
  brandSub: {
    fontSize: 7,
    letterSpacing: 2,
    color: "#666",
    marginTop: 2,
  },
  docType: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    letterSpacing: 4,
  },
  // ── Meta strip (quote number + dates) ───────────────────
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
  metaCell: {
    flex: 1,
    flexDirection: "column",
  },
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
  // ── Two-column blocks (Customer / Carrier) ─────────────
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
  blockBody: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  blockBodyBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 2,
  },
  // ── Section header band ─────────────────────────────────
  sectionBand: {
    backgroundColor: "#000",
    color: "#fff",
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  sectionBandText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 2,
    color: "#fff",
  },
  // ── Field grid inside section ───────────────────────────
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
  fieldCellLast: {
    flex: 1,
    padding: 8,
  },
  fieldLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 10,
  },
  fieldValueBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  // ── Rate table ──────────────────────────────────────────
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
  rateRowLast: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  rateLabel: {
    flex: 1,
    fontSize: 10,
  },
  rateAmount: {
    width: 80,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#000",
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  totalLabel: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "#fff",
  },
  totalAmount: {
    width: 100,
    textAlign: "right",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: "#fff",
  },
  // ── Notes / instructions ────────────────────────────────
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
  notesBody: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  // ── Footer ──────────────────────────────────────────────
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
  footerCell: {
    flex: 1,
  },
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
  redBar: {
    width: 4,
    height: 14,
    backgroundColor: "#dc2626",
    marginRight: 6,
  },
});

function currency(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function dateOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

export function QuotePDF({ data }: { data: QuotePdfData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* ── Header bar ─────────────────────────────────── */}
        <View style={styles.headerBar}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
            <View style={styles.redBar} />
            <View>
              <Text style={styles.brand}>HARBLANC</Text>
              <Text style={styles.brandSub}>SERVICES LLC</Text>
            </View>
          </View>
          <Text style={styles.docType}>QUOTE</Text>
        </View>

        {/* ── Meta strip ─────────────────────────────────── */}
        <View style={styles.metaStrip}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>QUOTE NUMBER</Text>
            <Text style={styles.metaValue}>{data.quoteNumber}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>ISSUED</Text>
            <Text style={styles.metaValue}>{dateOnly(data.issuedAt)}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>EXPIRES</Text>
            <Text style={styles.metaValue}>{dateOnly(data.expiresAt)}</Text>
          </View>
        </View>

        {/* ── Customer / Carrier two-column block ────────── */}
        <View style={styles.twoCol}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PREPARED FOR</Text>
            <Text style={styles.blockBodyBold}>{data.customerName ?? "—"}</Text>
            {data.customerContact ? (
              <Text style={styles.blockBody}>{data.customerContact}</Text>
            ) : null}
            {data.customerEmail ? (
              <Text style={styles.blockBody}>{data.customerEmail}</Text>
            ) : null}
            {data.customerPhone ? (
              <Text style={styles.blockBody}>{data.customerPhone}</Text>
            ) : null}
          </View>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PREPARED BY</Text>
            <Text style={styles.blockBodyBold}>{company.legalName}</Text>
            <Text style={styles.blockBody}>USDOT {company.dotNumber}</Text>
            <Text style={styles.blockBody}>MC {company.mcNumber}</Text>
            <Text style={styles.blockBody}>{company.authorityText}</Text>
            {data.preparedBy ? (
              <Text style={[styles.blockBody, { marginTop: 4, color: "#444" }]}>
                Prepared by {data.preparedBy}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Lane section ───────────────────────────────── */}
        <View style={styles.sectionBand}>
          <Text style={styles.sectionBandText}>LANE</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>ORIGIN</Text>
            <Text style={styles.fieldValueBold}>{data.origin ?? "—"}</Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>DESTINATION</Text>
            <Text style={styles.fieldValueBold}>{data.destination ?? "—"}</Text>
          </View>
        </View>
        <View style={[styles.fieldGrid, { marginTop: -14, borderTopWidth: 0.5 }]}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>PICKUP</Text>
            <Text style={styles.fieldValue}>{data.pickupWindow ?? "—"}</Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>DELIVERY</Text>
            <Text style={styles.fieldValue}>{data.deliveryWindow ?? "—"}</Text>
          </View>
        </View>

        {/* ── Shipment section ───────────────────────────── */}
        <View style={styles.sectionBand}>
          <Text style={styles.sectionBandText}>SHIPMENT</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>COMMODITY</Text>
            <Text style={styles.fieldValueBold}>{data.commodity ?? "—"}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>WEIGHT</Text>
            <Text style={styles.fieldValueBold}>
              {data.weightLbs ? `${data.weightLbs.toLocaleString()} lbs` : "—"}
            </Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>PIECES</Text>
            <Text style={styles.fieldValueBold}>
              {data.pieces ? String(data.pieces) : "—"}
            </Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>EQUIPMENT</Text>
            <Text style={styles.fieldValueBold}>
              {data.equipmentType ?? "—"}
            </Text>
          </View>
        </View>

        {/* ── Rate breakdown ─────────────────────────────── */}
        <View style={styles.sectionBand}>
          <Text style={styles.sectionBandText}>RATE BREAKDOWN</Text>
        </View>
        <View style={styles.rateTable}>
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Linehaul</Text>
            <Text style={styles.rateAmount}>{currency(data.linehaul)}</Text>
          </View>
          <View
            style={
              data.accessorials.length === 0
                ? styles.rateRowLast
                : styles.rateRow
            }
          >
            <Text style={styles.rateLabel}>Fuel surcharge</Text>
            <Text style={styles.rateAmount}>{currency(data.fuelSurcharge)}</Text>
          </View>
          {data.accessorials.map((acc, i) => (
            <View
              key={i}
              style={
                i === data.accessorials.length - 1
                  ? styles.rateRowLast
                  : styles.rateRow
              }
            >
              <Text style={styles.rateLabel}>{acc.label}</Text>
              <Text style={styles.rateAmount}>{currency(acc.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalAmount}>{currency(data.totalAmount)}</Text>
        </View>

        {/* ── Terms / instructions ──────────────────────── */}
        {data.specialInstructions ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>SPECIAL INSTRUCTIONS</Text>
            <Text style={styles.notesBody}>{data.specialInstructions}</Text>
          </View>
        ) : null}

        <View style={styles.notesBlock}>
          <Text style={styles.notesLabel}>PAYMENT TERMS</Text>
          <Text style={styles.notesBody}>{data.paymentTerms ?? "Net 30"}</Text>
        </View>

        {/* ── Footer ────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>AUTHORITY</Text>
            <Text style={styles.footerValue}>
              USDOT {company.dotNumber} / MC {company.mcNumber}
            </Text>
          </View>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>DISPATCH</Text>
            <Text style={styles.footerValue}>{company.dispatchEmail}</Text>
          </View>
          <View style={styles.footerCell}>
            <Text style={styles.footerLabel}>QUOTE</Text>
            <Text style={styles.footerValue}>{data.quoteNumber}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
