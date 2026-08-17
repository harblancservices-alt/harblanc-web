import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { renderEstimateEmailView } from "@/lib/domain/revenue-estimate";

/**
 * Email-form view of a sent Range proposal — /tms-v2's copy of admin's
 * estimate-email route (retirement-readiness Objective 1C). Same shared
 * core (@/lib/domain/revenue-estimate.ts), same output; only the auth
 * check differs (adminFromMiddleware() instead of requireAdmin()).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; estimateId: string }> },
): Promise<Response> {
  await adminFromMiddleware();

  const { id: quoteRequestId, estimateId } = await context.params;
  const result = await renderEstimateEmailView(quoteRequestId, estimateId);
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
