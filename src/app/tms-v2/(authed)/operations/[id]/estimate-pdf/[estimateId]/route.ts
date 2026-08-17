import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { renderEstimatePdf } from "@/lib/domain/revenue-estimate";

/**
 * On-demand Range Proposal PDF download — /tms-v2's copy of admin's
 * estimate-pdf route (retirement-readiness Objective 1C). Same shared
 * core (@/lib/domain/revenue-estimate.ts), same output; only the auth
 * check differs (adminFromMiddleware() instead of requireAdmin()).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; estimateId: string }> },
): Promise<Response> {
  await adminFromMiddleware();

  const { id: quoteRequestId, estimateId } = await context.params;
  const result = await renderEstimatePdf(quoteRequestId, estimateId);
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
