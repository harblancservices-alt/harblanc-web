import React from "react";
import type { BillOfLadingPdfData } from "./BillOfLadingPDF";

/**
 * Server-only PDF rendering for the Straight Bill of Lading. Returns a
 * Buffer ready to stream as the response body of a route handler, save
 * to Supabase Storage, or attach to an email send (future).
 *
 * NEVER import this module from a client component — @react-pdf/renderer
 * uses Node APIs that don't exist in the browser bundle.
 *
 * Same `as Parameters<typeof renderToBuffer>[0]` cast pattern as
 * renderQuotePdf.ts and renderFinalizedQuotePdf.ts.
 */
export async function renderBolPdfBuffer(
  data: BillOfLadingPdfData,
): Promise<Buffer> {
  // @react-pdf/renderer (yoga WASM + fontkit) and the PDF component are loaded
  // LAZILY here, never at module top-level: a load-time throw would otherwise
  // poison this module's export and 500 the route at import. Keeping it inside
  // the function isolates any failure to the actual render call.
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { BillOfLadingPDF } = await import("./BillOfLadingPDF");
  const element = React.createElement(BillOfLadingPDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
