import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  RangeProposalPDF,
  type RangeProposalPdfData,
} from "./RangeProposalPDF";

/**
 * Server-only PDF rendering for the Range Proposal document.
 * Returns a Buffer ready to stream as the response body of a route
 * handler.
 *
 * NEVER import this module from a client component — @react-pdf/renderer
 * uses Node APIs that don't exist in the browser bundle.
 *
 * Mirrors renderFinalizedQuotePdf.ts. The `as Parameters<typeof
 * renderToBuffer>[0]` cast is the same typing bridge — RangeProposalPDF
 * returns a <Document> at its root so the runtime shape matches; strict
 * mode would otherwise reject the generic ReactElement.
 */
export async function renderRangeProposalPdfBuffer(
  data: RangeProposalPdfData,
): Promise<Buffer> {
  const element = React.createElement(RangeProposalPDF, { data }) as Parameters<
    typeof renderToBuffer
  >[0];
  return renderToBuffer(element);
}
