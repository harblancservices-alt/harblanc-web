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
 * Server-rendered Rate Confirmation. Driven entirely from a shipment's Rate
 * Confirmation record — generated once per generateRateConfirmation() call
 * from an immutable snapshot of the shipment + carrier + broker profile +
 * lines at that moment (see shipments/rate-confirmation-actions.ts). This
 * component never reads live data itself, and it never invents a value:
 * every field below is whatever the snapshot carried, or an em-dash.
 *
 * TYPOGRAPHIC HIERARCHY (Brent-approved, _mockups_tmp/rc-redesign.html):
 * the VALUE is the hero — large, bold, near-black. The LABEL shrinks to
 * small uppercase letter-spaced grey with #5a6072 as the floor, never
 * lighter (the no-faint-grey rule). Exactly ONE rule per section header;
 * no per-field underlines and no boxes around the stops — whitespace, not
 * borders, separates fields. Sizes below are the mockup's CSS pixels at the
 * 0.72 px-to-point ratio a 100dpi Letter page implies (850px wide -> 612pt),
 * trimmed a little on the vertical rhythm because the real doc carries a
 * stop Date AND Time row that the mockup did not.
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
   * without dateLabel. Already AM/PM by construction — see timing.ts's
   * to12h(), which is where every window on this doc gets its meridiem. */
  timeLabel: string | null;
  /** LEGACY free-text window, still carried for shipments that predate the
   * timing model. Only rendered when dateLabel/timeLabel are absent. */
  window: string | null;
  number: string | null;
  notes: string | null;
};

/* Mockup tokens (rc-redesign.html's :root), carried over verbatim. */
const INK = "#14161d"; // value / heading ink — near black
const INK_2 = "#2b3040"; // secondary body ink
const LABEL = "#5a6072"; // LABEL grey — the floor, never lighter
const EMPTY = "#7a8194"; // em-dash placeholders only
const RULE = "#14161d"; // section rules — same weight as headings

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 34,
    paddingBottom: 24,
    fontSize: 10,
    // "CrmSans" (LiberationSans), embedded via embeddedFont.ts's
    // registerCrmSansFont() — not the PDF standard "Helvetica", which is
    // referenced by name only (no glyph data inside the PDF itself) and
    // left pdf.js's rasterizer (used for this doc's Documents-tab card
    // thumbnail) dependent on finding substitute glyph data in the
    // deployed Vercel function, which repeatedly failed silently. See
    // that file's header for the full story.
    //
    // It registers weights 400 and 700 ONLY, so every "bold" below is 700 —
    // the mockup's 600/700/800 ladder collapses to a single weight here and
    // the hierarchy is carried by SIZE and COLOR instead, which is what
    // does the work in the approved comp anyway.
    fontFamily: "CrmSans",
    color: INK,
  },

  /* ============================== HEADER ============================ */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1.8pt solid " + RULE,
    paddingBottom: 11.5,
  },
  brokerBlock: { flexDirection: "row", alignItems: "center", gap: 11.5 },
  logo: { width: 62, height: 62 },
  wordmark: { fontSize: 18.5, fontWeight: 700, letterSpacing: 0.15, color: INK },
  brokerLines: { marginTop: 5 },
  brokerLine: { fontSize: 8.3, color: INK_2, lineHeight: 1.5 },
  brokerReg: {
    marginTop: 2,
    fontSize: 7.9,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: INK,
  },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 18, fontWeight: 700, letterSpacing: 0.8, color: INK },
  docMeta: { marginTop: 10 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    gap: 8.6,
    marginTop: 4.3,
  },
  metaLabel: {
    fontSize: 6.1,
    fontWeight: 700,
    letterSpacing: 0.85,
    textTransform: "uppercase",
    color: LABEL,
  },
  metaValue: { fontSize: 10, fontWeight: 700, color: INK },

  /* ============================= SECTIONS =========================== */
  section: { marginTop: 11 },
  /* The ONE rule per section — on its header. Nothing else underlines. */
  heading: {
    fontSize: 8.6,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: INK,
    paddingBottom: 3.5,
    borderBottom: "1.1pt solid " + RULE,
    marginBottom: 7,
  },

  cols2: { flexDirection: "row", gap: 27 },
  col: { flex: 1 },

  /* Field grid — separation is whitespace, NOT underlines or boxes. */
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gridCellHalf: { width: "50%", marginBottom: 7, paddingRight: 11 },
  gridCellFull: { width: "100%", marginBottom: 7 },

  fieldLabel: {
    fontSize: 6.2,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: LABEL,
    lineHeight: 1.2,
  },
  fieldValue: { fontSize: 10, fontWeight: 700, lineHeight: 1.25, marginTop: 1.6, color: INK },
  fieldValueLg: { fontSize: 11.5, fontWeight: 700, lineHeight: 1.25, marginTop: 1.6, color: INK },
  fieldValueEmpty: { color: EMPTY, fontWeight: 400 },

  /* ============================ RATE BLOCK ========================== */
  rateLines: { marginTop: 1.5 },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 11.5,
    paddingVertical: 3.6,
  },
  rateLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.65,
    textTransform: "uppercase",
    color: LABEL,
  },
  rateAmount: { fontSize: 14.4, fontWeight: 700, color: INK },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 11.5,
    marginTop: 5.7,
    paddingTop: 8,
    borderTop: "1.8pt solid " + RULE,
  },
  /* A NORMAL bold inline line that reads as a sibling of the Linehaul row
     above it — deliberately not a banner. An oversized total was tried and
     rejected. */
  totalLabel: {
    fontSize: 8.3,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: INK,
  },
  totalAmount: { fontSize: 15.8, fontWeight: 700, color: INK },

  notice: {
    marginTop: 10,
    fontSize: 6.8,
    fontStyle: "italic",
    lineHeight: 1.45,
    color: "#4a5062",
  },

  /* ========================== SIGNATURE BLOCK ======================= */
  sigStatement: { fontSize: 7.9, lineHeight: 1.4, color: INK_2, marginBottom: 9.4 },
  sigRow: { flexDirection: "row", gap: 27 },
  sigBlock: { flex: 1 },
  sigLine: { minHeight: 18.7, borderBottom: "1.1pt solid " + RULE },
  sigLineLabel: {
    marginTop: 3.6,
    fontSize: 6.2,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: LABEL,
  },
});

function Field({ label, value, big }: { label: string; value: string | null; big?: boolean }) {
  const valueStyle = big ? styles.fieldValueLg : styles.fieldValue;
  return (
    <View>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Text style={value ? valueStyle : [valueStyle, styles.fieldValueEmpty]}>{value || "—"}</Text>
    </View>
  );
}

/** "$4,000.00" — the approved comp groups thousands. Presentation only; the
 * amount itself is whatever the RC's line carried. */
function money(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function StopBlock({ title, stop }: { title: string; stop: StopInfo }) {
  return (
    <View style={styles.col}>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.grid}>
        <View style={styles.gridCellFull}>
          <Field label="Facility / Company" value={stop.name} big />
        </View>
        <View style={styles.gridCellFull}>
          <Field
            label="Address"
            value={[stop.address, cityStateZip(stop.city, stop.state, stop.zip)].filter(Boolean).join(", ") || null}
          />
        </View>
        <View style={styles.gridCellHalf}>
          <Field label="Contact" value={titleCaseName(stop.contact)} />
        </View>
        <View style={styles.gridCellHalf}>
          <Field label="Phone" value={formatPhone(stop.phone)} />
        </View>
        {/* Date first, and always present when known — a time or window
            without its date is what made earlier RCs undispatchable. */}
        <View style={styles.gridCellHalf}>
          <Field label="Date" value={stop.dateLabel} />
        </View>
        <View style={styles.gridCellHalf}>
          <Field label="Number" value={stop.number} />
        </View>
        <View style={styles.gridCellFull}>
          {stop.dateLabel ? (
            <Field label="Time" value={stop.timeLabel} />
          ) : (
            <Field label="Window" value={stop.window} />
          )}
        </View>
        <View style={styles.gridCellFull}>
          <Field label="Notes" value={stop.notes} />
        </View>
      </View>
    </View>
  );
}

export function CrmRateConfirmationPDF({ data }: { data: CrmRateConfirmationPdfData }) {
  const brokerAddress = splitAddress(data.broker.address);
  const brokerPhone = formatPhone(data.broker.phone);
  // One contact line, as in the approved comp — phone and email on two
  // separate lines pushed the letterhead taller than the mark beside it.
  const contactLine = [brokerPhone, data.broker.email].filter(Boolean).join("  ·  ");
  const logoSrc = getHelloHotshotLogoDataUri();

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brokerBlock}>
            <Image src={logoSrc} style={styles.logo} />
            <View>
              <Text style={styles.wordmark}>{data.broker.name.toUpperCase() || "—"}</Text>
              <View style={styles.brokerLines}>
                {brokerAddress.street && (
                  <Text style={styles.brokerLine}>{properCaseAddressLine(brokerAddress.street)}</Text>
                )}
                {brokerAddress.cityStateZip && (
                  <Text style={styles.brokerLine}>{properCaseAddressLine(brokerAddress.cityStateZip)}</Text>
                )}
                {contactLine && <Text style={styles.brokerLine}>{contactLine}</Text>}
                <Text style={styles.brokerReg}>
                  MC {data.broker.mc || "—"} &nbsp;·&nbsp; DOT {data.broker.dot || "—"}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>RATE CONFIRMATION</Text>
            <View style={styles.docMeta}>
              <MetaRow label="RC #" value={data.rcNumber} />
              <MetaRow label="Issued" value={data.issuedDate} />
              <MetaRow label="Load #" value={data.shipment.shipmentNumber} />
            </View>
          </View>
        </View>

        <View style={[styles.section, styles.cols2]}>
          <View style={styles.col}>
            <Text style={styles.heading}>Load / Commodity</Text>
            <View style={styles.grid}>
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
              <View style={styles.gridCellFull}>
                <Field
                  label="Dimensions"
                  value={formatDimensionsIn(data.shipment.lengthIn, data.shipment.widthIn, data.shipment.heightIn)}
                />
              </View>
            </View>
          </View>

          <View style={styles.col}>
            <Text style={styles.heading}>Carrier</Text>
            <View style={styles.grid}>
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

        <View style={[styles.section, styles.cols2]}>
          <StopBlock title="Pickup" stop={data.pickup} />
          <StopBlock title="Delivery" stop={data.delivery} />
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Special Instructions</Text>
          <Field label="" value={data.specialInstructions} />
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.heading}>Rate &amp; Payment</Text>
          <View style={styles.cols2}>
            <View style={styles.col}>
              <View style={styles.grid}>
                <View style={styles.gridCellFull}>
                  <Field label="Payment Terms" value={data.paymentTerms} />
                </View>
                <View style={styles.gridCellFull}>
                  <Field label="Quick Pay" value={data.quickPay} />
                </View>
                <View style={styles.gridCellFull}>
                  <Field label="Notes" value={data.notes} />
                </View>
              </View>
            </View>
            <View style={styles.col}>
              <View style={styles.rateLines}>
                {data.lines.map((line, i) => (
                  <View key={i} style={styles.rateRow}>
                    <Text style={styles.rateLabel}>{line.label}</Text>
                    <Text style={styles.rateAmount}>{money(line.amount)}</Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Carrier Pay</Text>
                  {/* No pay lines at all means nobody has entered carrier pay —
                      distinct from a deliberate $0.00. Saying so is honest;
                      printing $0.00 reads as an agreed rate of zero. No value is
                      invented either way. */}
                  <Text style={styles.totalAmount}>
                    {data.lines.length === 0 ? "NOT ENTERED" : money(data.totalCarrierPay)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <Text style={styles.notice}>
            Signed POD and invoice are required for payment. Accessorial charges require
            prior written broker approval. No double brokering, rebrokering, or unauthorized
            transfer of this shipment.
          </Text>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.heading}>Carrier Acceptance</Text>
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
