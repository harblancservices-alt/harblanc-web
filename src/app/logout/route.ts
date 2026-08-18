import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /logout
 *
 * The single shared logout route for /admin and /tms-v2 (retirement
 * readiness — shared authentication carve-out; previously
 * /admin/logout, with a separate near-duplicate /tms-v2/logout that
 * existed only because this route lived inside src/app/admin/**).
 *
 * Signs the current session out and redirects to /login. Mounted as a
 * POST handler so it can be triggered by a plain
 * `<form action="/logout" method="post">` button without JS. Returns
 * 303 See Other so the redirect lands on a GET.
 */
export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url, { status: 303 });
}
