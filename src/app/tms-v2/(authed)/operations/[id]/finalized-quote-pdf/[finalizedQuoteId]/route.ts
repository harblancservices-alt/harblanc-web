import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { renderFinalizedQuotePdf } from "@/lib/domain/revenue-finalized-quote";

/**
 * On-demand Finalized Quote PDF download — /tms-v2's copy of admin's
 * finalized-quote-pdf route (retirement-readiness Objective 1C). Same
 * shared core (@/lib/domain/revenue-finalized-quote.ts), same output;
 * only the auth check differs (adminFromMiddleware() instead of
 * requireAdmin()).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; finalizedQuoteId: string }> },
): Promise<Response> {
  await adminFromMiddleware();

  const { id: quoteRequestId, finalizedQuoteId } = await context.params;
  const result = await renderFinalizedQuotePdf(quoteRequestId, finalizedQuoteId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new Response(result.buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
