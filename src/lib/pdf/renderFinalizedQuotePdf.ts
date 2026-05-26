import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  FinalizedQuotePDF,
  type FinalizedQuotePdfData,
} from "./FinalizedQuotePDF";

/**
 * Server-only PDF rendering for the Finalized Quote / Rate
 * Confirmation document. Returns a Buffer ready to stream as the
 * response body of a route handler, save to Supabase Storage, or
 * attach to an email send (future).
 *
 * NEVER import this module from a client component — @react-pdf/renderer
 * uses Node APIs that don't exist in the browser bundle.
 *
 * Same `as Parameters<typeof renderToBuffer>[0]` cast pattern as
 * renderQuotePdf.ts — React.createElement on a custom component
 * returns a generic ReactElement, which strict mode rejects without
 * the cast. FinalizedQuotePDF renders a <Document> at its root so the
 * runtime shape matches; this is a pure typing bridge.
 */
export async function renderFinalizedQuotePdfBuffer(
  data: FinalizedQuotePdfData,
): Promise<Buffer> {
  const element = React.createElement(FinalizedQuotePDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
