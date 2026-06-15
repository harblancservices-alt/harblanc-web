import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { lookupFmcsa } from "@/lib/fmcsa";

/**
 * GET /api/admin/fmcsa?mc=123456  or  ?dot=76830
 *
 * Admin-only proxy to the FMCSA QCMobile API. Keeps the webKey server-side
 * and returns a normalized broker record (or 404 if nothing matches).
 */
export async function GET(request: Request): Promise<Response> {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const mc = searchParams.get("mc")?.trim();
  const dot = searchParams.get("dot")?.trim();

  if (!mc && !dot) {
    return NextResponse.json(
      { error: "Provide an mc or dot query parameter." },
      { status: 400 },
    );
  }

  try {
    const result = dot
      ? await lookupFmcsa(dot, "dot")
      : await lookupFmcsa(mc as string, "mc");
    if (!result) {
      return NextResponse.json({ error: "No match found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
