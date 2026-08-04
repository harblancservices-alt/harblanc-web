/**
 * Typed, paginated query module for `trips` (v2-architecture.md §3c). See
 * loads.ts's header — same DataSource-delegation contract.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Paginated } from "./pagination";
import type { TripFinancials } from "@/lib/domain/money";

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
