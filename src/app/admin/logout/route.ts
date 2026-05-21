import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /admin/logout
 *
 * Signs the current session out and redirects to /admin/login.
 * Mounted as a POST handler so it can be triggered by a plain
 * `<form action="/admin/logout" method="post">` button without JS.
 * Returns 303 See Other so the redirect lands on a GET.
 */
export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  await supabase.auth.signOut();
  const url = new URL("/admin/login", request.url);
  return NextResponse.redirect(url, { status: 303 });
}
