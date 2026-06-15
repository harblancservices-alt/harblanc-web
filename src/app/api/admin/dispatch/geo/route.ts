import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { lookupZip, estimateLaneMiles } from "@/lib/dispatch/distance";

/**
 * GET /api/admin/dispatch/geo
 *   ?zip=12345           → { city, state }
 *   ?o=12345&d=67890     → { origin:{city,state}, dest:{city,state}, miles }
 *
 * Admin-only. Keeps the (large) zipcodes dataset server-side so the Add
 * Load form can resolve cities and lane miles without bundling it.
 */
export async function GET(request: Request): Promise<Response> {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get("zip")?.trim();
  const o = searchParams.get("o")?.trim();
  const d = searchParams.get("d")?.trim();

  if (o && d) {
    const res = estimateLaneMiles(o, d);
    if (!res.ok) {
      return NextResponse.json({ error: res.reason }, { status: 422 });
    }
    return NextResponse.json({
      origin: { city: res.origin.city, state: res.origin.state },
      dest: { city: res.destination.city, state: res.destination.state },
      miles: res.miles,
    });
  }

  if (zip) {
    const r = lookupZip(zip);
    if (!r) {
      return NextResponse.json({ error: `Unknown ZIP: ${zip}` }, { status: 422 });
    }
    return NextResponse.json({ city: r.city, state: r.state });
  }

  return NextResponse.json(
    { error: "Provide ?zip= or ?o=&d=." },
    { status: 400 },
  );
}
