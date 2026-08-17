import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { renderBolPdf } from "@/lib/domain/revenue-bol";

/**
 * On-demand Bill of Lading PDF download — /tms-v2's copy of admin's
 * bol-pdf route (retirement-readiness Objective 1C). Same shared core
 * (@/lib/domain/revenue-bol.ts), same output; only the auth check
 * differs (adminFromMiddleware() instead of requireAdmin()).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; bolId: string }> },
): Promise<Response> {
  await adminFromMiddleware();

  const { id: quoteRequestId, bolId } = await context.params;
  const result = await renderBolPdf(quoteRequestId, bolId);
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
