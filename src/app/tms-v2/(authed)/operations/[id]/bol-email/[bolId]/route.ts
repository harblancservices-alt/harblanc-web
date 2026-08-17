import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { renderBolEmailView } from "@/lib/domain/revenue-bol";

/**
 * Email-form view of a sent Bill of Lading — /tms-v2's copy of admin's
 * bol-email route (retirement-readiness Objective 1C). Same shared core
 * (@/lib/domain/revenue-bol.ts), same output; only the auth check
 * differs (adminFromMiddleware() instead of requireAdmin()).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; bolId: string }> },
): Promise<Response> {
  await adminFromMiddleware();

  const { id: quoteRequestId, bolId } = await context.params;
  const result = await renderBolEmailView(quoteRequestId, bolId);
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
