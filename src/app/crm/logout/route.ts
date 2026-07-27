import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * CRM sign-out. Clears the Supabase session cookies and returns to the CRM
 * login. Independent of the admin logout route.
 */
export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/crm/login", request.url), {
    status: 303,
  });
}
