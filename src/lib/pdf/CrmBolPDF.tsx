import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { company } from "@/lib/company";

/**
 * A quick, self-contained Bill of Lading a CRM rep can generate straight
 * from a company profile — deliberately NOT the same component as
 * BillOfLadingPDF.tsx (that one is a full carrier/rate-confirmation
 * document built for an actual tms-v2 load, with fields — rate, freight
 * class, load id — the CRM has no source data for). This one only needs
 * what the CRM already has (the account as Shipper, Harblanc as Carrier)
 * plus a handful of fields the rep fills in on the spot (Consignee,
 * commodity, weight, pieces, special instructions) — no load, no schema.
 */
export type CrmBolPdfData = {
  date: string;
  reference: string | null;
  shipper: {
    name: string;
    address: string | null;
    phone: string | null;
  };
  consignee: {
    name: string | null;
    address: string | null;
  };
  commodity: string | null;
  weight: string | null;
  pieces: string | null;
  specialInstructions: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "2pt solid #1a1a1a",
    paddingBottom: 10,
    marginBottom: 14,
  },
  docType: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
  },
  metaLabel: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 10,
    marginTop: 2,
  },
  sectionRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 14,
  },
  section: {
    flex: 1,
    border: "1pt solid #ccc",
    padding: 8,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldLine: {
    fontSize: 10,
    marginBottom: 2,
  },
  table: {
    border: "1pt solid #ccc",
    marginBottom: 14,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #ccc",
  },
  tableCellLabel: {
    width: "25%",
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    padding: 6,
    borderRight: "1pt solid #ccc",
  },
  tableCellValue: {
    width: "25%",
    fontSize: 10,
    padding: 6,
    borderRight: "1pt solid #ccc",
  },
  notesBox: {
    border: "1pt solid #ccc",
    padding: 8,
    minHeight: 50,
    marginBottom: 24,
  },
  signRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 20,
  },
  signBlock: {
    flex: 1,
    borderTop: "1pt solid #1a1a1a",
    paddingTop: 4,
    fontSize: 8,
    color: "#666",
  },
});

export function CrmBolPDF({ data }: { data: CrmBolPdfData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.docType}>BILL OF LADING</Text>
            <Text style={styles.metaValue}>{company.shortName}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{data.date}</Text>
            {data.reference && (
              <>
                <Text style={[styles.metaLabel, { marginTop: 6 }]}>Reference</Text>
                <Text style={styles.metaValue}>{data.reference}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.sectionRow}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Shipper</Text>
            <Text style={styles.fieldLine}>{data.shipper.name}</Text>
            {data.shipper.address && (
              <Text style={styles.fieldLine}>{data.shipper.address}</Text>
            )}
            {data.shipper.phone && <Text style={styles.fieldLine}>{data.shipper.phone}</Text>}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Consignee</Text>
            <Text style={styles.fieldLine}>{data.consignee.name || "—"}</Text>
            {data.consignee.address && (
              <Text style={styles.fieldLine}>{data.consignee.address}</Text>
            )}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Carrier</Text>
            <Text style={styles.fieldLine}>{company.legalName}</Text>
            <Text style={styles.fieldLine}>{company.dot}</Text>
            <Text style={styles.fieldLine}>{company.mc}</Text>
            <Text style={styles.fieldLine}>{company.dispatchPhone}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableCellLabel}>Commodity</Text>
            <Text style={styles.tableCellValue}>{data.commodity || "—"}</Text>
            <Text style={styles.tableCellLabel}>Weight</Text>
            <Text style={[styles.tableCellValue, { borderRight: "none" }]}>
              {data.weight || "—"}
            </Text>
          </View>
          <View style={[styles.tableRow, { borderBottom: "none" }]}>
            <Text style={styles.tableCellLabel}>Pieces / Pallets</Text>
            <Text style={[styles.tableCellValue, { width: "75%", borderRight: "none" }]}>
              {data.pieces || "—"}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Special Instructions</Text>
        <View style={styles.notesBox}>
          <Text style={styles.fieldLine}>{data.specialInstructions || ""}</Text>
        </View>

        <View style={styles.signRow}>
          <Text style={styles.signBlock}>Shipper signature / date</Text>
          <Text style={styles.signBlock}>Driver signature / date</Text>
          <Text style={styles.signBlock}>Consignee signature / date</Text>
        </View>
      </Page>
    </Document>
  );
}
