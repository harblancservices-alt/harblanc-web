import type { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * The names of every open trip, newest first — the options the Add/Edit Load
 * trip picker offers.
 *
 * "Open" is `status !== "closed"`, matching how the Trips page splits its own
 * list. That difference matters: a trip created implicitly by resolveTripId is
 * inserted with only a name, so its status leans on the column default and can
 * be NULL. `.eq("status", "active")` drops those rows (in SQL nothing equals
 * NULL), which is how a trip could sit on the Trips page as active yet never
 * appear in the load form's picker. Filtering in JS treats NULL as open, so
 * both screens agree on what's active.
 */
export async function fetchOpenTripNames(
  sb: ReturnType<typeof createServiceRoleClient>,
): Promise<string[]> {
  const { data } = await sb
    .from("trips")
    .select("name, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<{ name: string | null; status: string | null }[]>();

  const names = (data ?? [])
    .filter((t) => t.status !== "closed")
    .map((t) => t.name?.trim() ?? "")
    .filter((n) => n.length > 0);
  return [...new Set(names)];
}
