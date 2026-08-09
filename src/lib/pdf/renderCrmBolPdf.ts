import React from "react";
import type { CrmBolPdfData } from "./CrmBolPDF";

/**
 * Server-only PDF rendering for the CRM's quick Bill of Lading. Same lazy-
 * import pattern as renderBolPdf.ts — @react-pdf/renderer is loaded inside
 * the function, never at module top-level, so a load-time failure can't
 * poison this module's export.
 */
export async function renderCrmBolPdfBuffer(data: CrmBolPdfData): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { CrmBolPDF } = await import("./CrmBolPDF");
  const element = React.createElement(CrmBolPDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
