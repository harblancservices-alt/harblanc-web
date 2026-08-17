import React from "react";
import type { CrmRateConfirmationPdfData } from "./CrmRateConfirmationPDF";
import { registerCrmSansFont } from "./embeddedFont";

/**
 * Server-only PDF rendering for the shipment-based Rate Confirmation. Same
 * lazy-import pattern as renderCrmBolPdf.ts / renderBolPdf.ts —
 * @react-pdf/renderer is loaded inside the function, never at module
 * top-level, so a load-time failure can't poison this module's export.
 */
export async function renderCrmRateConfirmationPdfBuffer(
  data: CrmRateConfirmationPdfData,
): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  await registerCrmSansFont();
  const { CrmRateConfirmationPDF } = await import("./CrmRateConfirmationPDF");
  const element = React.createElement(CrmRateConfirmationPDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
