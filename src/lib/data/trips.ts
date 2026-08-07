/**
 * Typed, paginated query module for `trips` (v2-architecture.md §3c). See
 * loads.ts's header — same DataSource-delegation contract.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Paginated } from "./pagination";
import type { TripFinancials } from "@/lib/domain/money";
import { isDemoMode } from "@/lib/admin/demo";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type TripStatus = "active" | "closed";

export type TripWithFinancials = {
  id: string;
  name: string | null;
  status: TripStatus;
  notes: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  startedAt: string | null;
  endedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
  loadIds: string[];
  financials: TripFinancials;
};

export type ListTripsOptions = {
  page?: number;
  pageSize?: number;
  status?: TripStatus;
};

export async function listTrips(opts: ListTripsOptions = {}): Promise<Paginated<TripWithFinancials>> {
  const ds = await resolveDataSource();
  return ds.listTrips(opts);
}

export async function getTripById(id: string): Promise<TripWithFinancials | null> {
  const ds = await resolveDataSource();
  return ds.getTripById(id);
}

export type ArchivedTripRow = { id: string; name: string | null; deletedAt: string };

/** Soft-deleted trips — the Trips list's trash section (Phase 6 item 4),
 * same new-capability gap as loads (neither /admin nor tms-v2 had a
 * restore path for either entity before this). */
export async function listArchivedTrips(): Promise<ArchivedTripRow[]> {
  if (await isDemoMode()) return [];

  const sb = createServiceRoleClient();
  const { data } = await sb
    .from("trips")
    .select("id, name, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(50)
    .returns<{ id: string; name: string | null; deleted_at: string | null }[]>();

  return (data ?? [])
    .filter((t) => t.deleted_at !== null)
    .map((t) => ({ id: t.id, name: t.name, deletedAt: t.deleted_at as string }));
}
