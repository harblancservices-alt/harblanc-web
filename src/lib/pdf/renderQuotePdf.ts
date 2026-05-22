import { renderToBuffer } from "@react-pdf/renderer";
import { QuotePDF, type QuotePdfData } from "./QuotePDF";
import React from "react";

/**
 * Server-only PDF rendering for the Premium Carrier Quote.
 * Returns a Buffer ready to upload to Supabase Storage.
 *
 * NEVER import this module from a client component — @react-pdf/renderer
 * uses Node APIs that don't exist in the browser bundle.
 *
 * The `Parameters<typeof renderToBuffer>[0]` cast pins the QuotePDF
 * element to the exact ReactElement<DocumentProps> shape renderToBuffer
 * expects. React.createElement on a custom component returns a generic
 * ReactElement, so without this cast strict mode rejects the call.
 * The QuotePDF component itself renders a <Document> at its root, so
 * the runtime shape matches; this is a pure typing bridge.
 */
export async function renderQuotePdfBuffer(
  data: QuotePdfData,
): Promise<Buffer> {
  const element = React.createElement(QuotePDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  const buffer = await renderToBuffer(element);
  return buffer;
}
