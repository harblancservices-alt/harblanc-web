import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /tms-v2/logout
 *
 * /tms-v2's copy of /admin/logout (retirement-readiness Objective 2 —
 * found via dependency sweep: tms-v2's own MoreSheet/Sidebar logout
 * buttons were posting to admin's route). Signs the current session out
 * and redirects to /admin/login — there is no /tms-v2/login; both apps
 * share the single login door (see tms-v2's (authed)/layout.tsx).
 * Mounted as a POST handler so it can be triggered by a plain
 * `<form action="/tms-v2/logout" method="post">` button without JS.
 * Returns 303 See Other so the redirect lands on a GET.
 */
export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  await supabase.auth.signOut();
  const url = new URL("/admin/login", request.url);
  return NextResponse.redirect(url, { status: 303 });
}
