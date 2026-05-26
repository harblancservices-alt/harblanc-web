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
 * Finalized Quote / Rate Confirmation PDF.
 *
 * Print-document twin of the Rate Confirmation email rendered by
 * src/lib/email/finalized-quote.ts. Same operational paperwork
 * vocabulary (black/white/red, mono-uppercase section bands,
 * inverted-black total row) — translated into @react-pdf/renderer
 * components for a print-safe Letter page.
 *
 * Document order mirrors the email:
 *   1. Header bar — HARBLANC lockup + "RATE CONFIRMATION" doctype
 *   2. Meta strip — Quote # / Issued / Valid through / Payment due
 *   3. Prepared For / Prepared By two-column block
 *   4. Pickup + Delivery two-column block (one band each)
 *   5. Freight section — commodity / dims / weight / qty / handling
 *   6. Ops chips (active flags only)
 *   7. Rate section — line items + Total + footer dates
 *   8. Dispatch notes (only when present)
 *   9. Disclaimer
 *  10. Fixed footer — authority + dispatch contact
 *
 * Generated on demand by the admin GET route in
 * src/app/admin/(authed)/quotes/finalized-quote-pdf/[finalizedQuoteId]/route.ts.
 * Not attached to email sends — that path stays untouched in Phase 2C.
 */

const LOGO_URL = `${
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com"
}/brand/harblanc-pro.png`;

// ─── Data type ────────────────────────────────────────────────────────────
//
// Mirrors the email's FinalizedQuotePayload but flattened for print.
// Caller (the route handler) builds this from the FQ row + lead + the
// same row.confirmation_token URL — no business-rule derivation in the
// renderer.

export type FinalizedQuotePdfData = {
  quoteNumber: string;            // "RC-2026-0042"
  dispatchReference: string;      // "HS-A4F2-9B1C" — last 8 hex of lead.id
  issuedAt: string;               // YYYY-MM-DD
  expirationAt: string | null;
  paymentDueAt: string | null;

  customerName: string;
  customerEmail: string | null;

  pickup: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    window: string | null;
  };

  delivery: {
    company: string | null;
    contactName: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    window: string | null;
  };

  freight: {
    commodity: string | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
    weightLbs: number | null;
    quantity: number | null;
    handlingType: string | null;
    runningCondition: string | null;
    securementRequirements: string | null;
  };

  ops: {
    forkliftAvailable: boolean | null;
    driverAssistRequired: boolean | null;
    craneRequired: boolean | null;
    permitsRequired: boolean | null;
    escortRequired: boolean | null;
    tarpRequired: boolean | null;
    specialInstructions: string | null;
  };

  rate: {
    linehaul: number;
    fuelSurcharge: number | null;
    permitsFee: number | null;
    accessorials: ReadonlyArray<{ label: string; amount: number }>;
    totalAmount: number;
  };

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
  // ── Header bar ─────────────────────────────────────────
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
  // ── Meta strip — Quote # / Issued / Valid / Payment due ─
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
  // ── Two-column blocks ─────────────────────────────────
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
  // ── Section band ─────────────────────────────────────
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
  // ── Field grid ────────────────────────────────────────
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
  // ── Ops chips ────────────────────────────────────────
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    padding: 8,
    marginBottom: 14,
    marginTop: -14,
    gap: 4,
  },
  chip: {
    borderWidth: 0.5,
    borderColor: "#000",
    backgroundColor: "#f3f3f3",
    paddingVertical: 2,
    paddingHorizontal: 5,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
  },
  // ── Rate table ───────────────────────────────────────
  rateTable: {
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
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
  rateLabel: { flex: 1, fontSize: 10 },
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
  // Footer dates strip below total
  rateFooterStrip: {
    flexDirection: "row",
    borderWidth: 0.5,
    borderColor: "#000",
    borderTopWidth: 0,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  rateFooterCell: { flex: 1, flexDirection: "row" },
  rateFooterLabel: {
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: "#444",
    marginRight: 6,
    paddingTop: 1,
  },
  rateFooterValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
  },
  // ── Notes block ───────────────────────────────────────
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
  // ── Disclaimer ────────────────────────────────────────
  disclaimer: {
    fontSize: 8,
    color: "#52525b",
    lineHeight: 1.4,
    marginBottom: 14,
  },
  // ── Footer ────────────────────────────────────────────
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
    minimumFractionDigits: 2,
  });
}

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

function joinAddress(loc: FinalizedQuotePdfData["pickup"]): string {
  const lines: string[] = [];
  if (loc.addressLine1) lines.push(loc.addressLine1);
  if (loc.addressLine2) lines.push(loc.addressLine2);
  const cityState: string[] = [];
  if (loc.city) cityState.push(loc.city);
  if (loc.state) cityState.push(loc.state);
  let line3 = cityState.join(", ");
  if (loc.zip) line3 = line3 ? `${line3} ${loc.zip}` : loc.zip;
  if (line3) lines.push(line3);
  return lines.join("\n");
}

function activeOpsFlags(ops: FinalizedQuotePdfData["ops"]): string[] {
  const labels: Array<[boolean | null, string]> = [
    [ops.forkliftAvailable, "FORKLIFT AVAILABLE"],
    [ops.driverAssistRequired, "DRIVER ASSIST"],
    [ops.craneRequired, "CRANE / RIGGING"],
    [ops.permitsRequired, "PERMITS"],
    [ops.escortRequired, "ESCORT"],
    [ops.tarpRequired, "TARP"],
  ];
  return labels.filter(([v]) => v === true).map(([, l]) => l);
}

function formatDimensions(f: FinalizedQuotePdfData["freight"]): string {
  const parts: string[] = [];
  if (f.lengthIn !== null) parts.push(`${f.lengthIn}"L`);
  if (f.widthIn !== null) parts.push(`${f.widthIn}"W`);
  if (f.heightIn !== null) parts.push(`${f.heightIn}"H`);
  return parts.join(" × ");
}

const DISCLAIMER_TEXT =
  "This rate reflects the shipment scope confirmed by dispatch. Changes to the load or schedule may require a revised quote.";

export function FinalizedQuotePDF({
  data,
}: {
  data: FinalizedQuotePdfData;
}) {
  const ops = activeOpsFlags(data.ops);
  const pickupAddr = joinAddress(data.pickup);
  const deliveryAddr = joinAddress(data.delivery);
  const dims = formatDimensions(data.freight);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header bar — logo + RATE CONFIRMATION */}
        <View style={styles.headerBar}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image accepts no alt prop */}
          <Image src={LOGO_URL} style={styles.logoLockup} />
          <Text style={styles.docType}>
            RATE <Text style={styles.docTypeAccent}>CONFIRMATION</Text>
          </Text>
        </View>

        {/* Meta strip — Quote # / Issued / Valid through / Payment due */}
        <View style={styles.metaStrip}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>QUOTE #</Text>
            <Text style={[styles.metaValue, styles.metaValueAccent]}>
              {data.quoteNumber}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>DISPATCH REF</Text>
            <Text style={styles.metaValue}>{data.dispatchReference}</Text>
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
            <Text style={styles.metaLabel}>PAYMENT DUE</Text>
            <Text style={styles.metaValue}>{dateOnly(data.paymentDueAt)}</Text>
          </View>
        </View>

        {/* Prepared For / Prepared By */}
        <View style={styles.twoCol}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>PREPARED FOR</Text>
            <Text style={styles.blockBodyBold}>{data.customerName}</Text>
            {data.customerEmail ? (
              <Text style={styles.blockBody}>{data.customerEmail}</Text>
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

        {/* Pickup section */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>PICKUP</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>COMPANY</Text>
            <Text style={styles.fieldValueBold}>
              {data.pickup.company ?? "—"}
            </Text>
            {data.pickup.contactName ? (
              <Text style={[styles.fieldValue, { marginTop: 4 }]}>
                {data.pickup.contactName}
              </Text>
            ) : null}
            {data.pickup.contactPhone ? (
              <Text style={styles.fieldValue}>{data.pickup.contactPhone}</Text>
            ) : null}
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>ADDRESS</Text>
            <Text style={styles.fieldValue}>{pickupAddr || "—"}</Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>PICKUP WINDOW</Text>
            <Text style={styles.fieldValueBold}>
              {data.pickup.window ?? "—"}
            </Text>
          </View>
        </View>

        {/* Delivery section */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>DELIVERY</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>COMPANY</Text>
            <Text style={styles.fieldValueBold}>
              {data.delivery.company ?? "—"}
            </Text>
            {data.delivery.contactName ? (
              <Text style={[styles.fieldValue, { marginTop: 4 }]}>
                {data.delivery.contactName}
              </Text>
            ) : null}
            {data.delivery.contactPhone ? (
              <Text style={styles.fieldValue}>
                {data.delivery.contactPhone}
              </Text>
            ) : null}
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>ADDRESS</Text>
            <Text style={styles.fieldValue}>{deliveryAddr || "—"}</Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>DELIVERY WINDOW</Text>
            <Text style={styles.fieldValueBold}>
              {data.delivery.window ?? "—"}
            </Text>
          </View>
        </View>

        {/* Freight section */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>FREIGHT</Text>
        </View>
        <View style={styles.fieldGrid}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>COMMODITY</Text>
            <Text style={styles.fieldValueBold}>
              {data.freight.commodity ?? "—"}
            </Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>DIMENSIONS</Text>
            <Text style={styles.fieldValueBold}>{dims || "—"}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>WEIGHT</Text>
            <Text style={styles.fieldValueBold}>
              {data.freight.weightLbs
                ? `${data.freight.weightLbs.toLocaleString()} lbs`
                : "—"}
            </Text>
          </View>
          <View style={styles.fieldCellLast}>
            <Text style={styles.fieldLabel}>QUANTITY</Text>
            <Text style={styles.fieldValueBold}>
              {data.freight.quantity !== null
                ? String(data.freight.quantity)
                : "—"}
            </Text>
          </View>
        </View>
        {(data.freight.handlingType ||
          data.freight.runningCondition ||
          data.freight.securementRequirements) ? (
          <View style={[styles.fieldGrid, { marginTop: -14, borderTopWidth: 0.5 }]}>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>HANDLING</Text>
              <Text style={styles.fieldValue}>
                {data.freight.handlingType ?? "—"}
              </Text>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>CONDITION</Text>
              <Text style={styles.fieldValue}>
                {data.freight.runningCondition ?? "—"}
              </Text>
            </View>
            <View style={styles.fieldCellLast}>
              <Text style={styles.fieldLabel}>SECUREMENT</Text>
              <Text style={styles.fieldValue}>
                {data.freight.securementRequirements ?? "—"}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Operational requirements — only active flags chip strip */}
        {ops.length > 0 ? (
          <View style={styles.chipRow}>
            {ops.map((flag) => (
              <Text key={flag} style={styles.chip}>
                {flag}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Rate section */}
        <View style={styles.sectionBand}>
          <View style={styles.redBar} />
          <Text style={styles.sectionBandText}>RATE</Text>
        </View>
        <View style={styles.rateTable}>
          <View style={styles.rateRow}>
            <Text style={styles.rateLabel}>Linehaul</Text>
            <Text style={styles.rateAmount}>{currency(data.rate.linehaul)}</Text>
          </View>
          {data.rate.fuelSurcharge !== null ? (
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Fuel</Text>
              <Text style={styles.rateAmount}>
                {currency(data.rate.fuelSurcharge)}
              </Text>
            </View>
          ) : null}
          {data.rate.permitsFee !== null ? (
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Permits</Text>
              <Text style={styles.rateAmount}>
                {currency(data.rate.permitsFee)}
              </Text>
            </View>
          ) : null}
          {data.rate.accessorials.map((acc, i) => (
            <View
              key={i}
              style={
                i === data.rate.accessorials.length - 1
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
          <Text style={styles.totalAmount}>
            {currency(data.rate.totalAmount)}
          </Text>
        </View>
        {(data.expirationAt || data.paymentDueAt) ? (
          <View style={styles.rateFooterStrip}>
            {data.expirationAt ? (
              <View style={styles.rateFooterCell}>
                <Text style={styles.rateFooterLabel}>VALID THROUGH</Text>
                <Text style={styles.rateFooterValue}>
                  {dateOnly(data.expirationAt)}
                </Text>
              </View>
            ) : null}
            {data.paymentDueAt ? (
              <View style={styles.rateFooterCell}>
                <Text style={styles.rateFooterLabel}>PAYMENT DUE</Text>
                <Text style={styles.rateFooterValue}>
                  {dateOnly(data.paymentDueAt)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ marginBottom: 14 }} />
        )}

        {/* Dispatch notes — only when present */}
        {data.ops.specialInstructions ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>DISPATCH NOTES</Text>
            <Text style={styles.notesBody}>{data.ops.specialInstructions}</Text>
          </View>
        ) : null}

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>{DISCLAIMER_TEXT}</Text>

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
