import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  BillOfLadingPDF,
  type BillOfLadingPdfData,
} from "./BillOfLadingPDF";

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
  const element = React.createElement(BillOfLadingPDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
