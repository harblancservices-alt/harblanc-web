/**
 * Typed, paginated, scoped query module for `loads` (v2-architecture.md
 * §3c). This is the ONLY file a /tms-v2 screen imports to read load data —
 * it never constructs a Supabase client itself; every function resolves
 * the current `DataSource` (§10, real DB or demo dataset) and delegates.
 * That indirection is what makes demo-mode isolation and query-shape
 * scoping structural rather than a convention a future caller could skip.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Paginated } from "./pagination";
import type { LoadFinancials } from "@/lib/domain/money";
import type { Period } from "@/lib/domain/attribution";

export type LoadStatus = "pending" | "assigned" | "loaded" | "delivered" | "tonu";

export type LoadWithFinancials = {
  id: string;
  loadNumber: string | null;
  brokerId: string | null;
  brokerName: string | null;
  brokerFactoring: boolean;
  tripId: string | null;
  tripName: string | null;
  origin: string | null;
  destination: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  status: LoadStatus;
  paymentStatus: "unpaid" | "paid";
  paidAt: string | null;
  createdAt: string | null;
  /** The load's period-attribution date (v2-architecture.md §3b) — pickup
   * date, always, with fallbacks only for legacy rows missing it. */
  attributionDate: string | null;
  financials: LoadFinancials;
};

export type ListLoadsOptions = {
  page?: number;
  pageSize?: number;
  /** Clips the query to one calendar period by pickup_date — the one
   * profit-attribution rule, applied at the query layer so a period view
   * never reads rows outside it (v2-architecture.md §3b/§3c). */
  period?: Period;
  brokerId?: string;
  status?: LoadStatus;
};

export async function listLoads(opts: ListLoadsOptions = {}): Promise<Paginated<LoadWithFinancials>> {
  const ds = await resolveDataSource();
  return ds.listLoads(opts);
}

export async function getLoadById(id: string): Promise<LoadWithFinancials | null> {
  const ds = await resolveDataSource();
  return ds.getLoadById(id);
}

/** Loads not yet closed out (pending/assigned/loaded) — what's currently
 * on the road. Bounded by `limit`, not a status-filtered full scan. */
export async function listActiveLoads(limit = 20): Promise<LoadWithFinancials[]> {
  const ds = await resolveDataSource();
  return ds.listActiveLoads(limit);
}
