import React from "react";
import type { CrmShipmentBolPdfData } from "./CrmShipmentBolPDF";

/**
 * Server-only PDF rendering for the shipment-based Bill of Lading. Same
 * lazy-import pattern as renderCrmBolPdf.ts / renderBolPdf.ts —
 * @react-pdf/renderer is loaded inside the function, never at module
 * top-level, so a load-time failure can't poison this module's export.
 */
export async function renderCrmShipmentBolPdfBuffer(
  data: CrmShipmentBolPdfData,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { CrmShipmentBolPDF } = await import("./CrmShipmentBolPDF");
  const element = React.createElement(CrmShipmentBolPDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
