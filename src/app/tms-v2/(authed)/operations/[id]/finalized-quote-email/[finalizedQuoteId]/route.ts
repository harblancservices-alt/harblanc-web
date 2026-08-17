import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { renderFinalizedQuoteEmailView } from "@/lib/domain/revenue-finalized-quote";

/**
 * Email-form view of a sent Finalized Quote — /tms-v2's copy of admin's
 * finalized-quote-email route (retirement-readiness Objective 1C). Same
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
  const result = await renderFinalizedQuoteEmailView(quoteRequestId, finalizedQuoteId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return new Response(result.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
