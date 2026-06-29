import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { searchCities } from "@/lib/dispatch/distance";

/**
 * GET /api/admin/dispatch/cities?q=dall → { cities: [{ city, state, zip, lat, lon }] }
 *
 * Admin-only city typeahead. Keeps the (large) zipcodes dataset server-side so
 * the contact-farming form gets fast, offline city→ZIP suggestions without
 * bundling the dataset into the client or needing an API key.
 */
export async function GET(request: Request): Promise<Response> {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cities: [] });
  return NextResponse.json({ cities: searchCities(q, 12) });
}
