/**
 * The DataSource interface — the single seam every /tms-v2 data access
 * goes through (v2-architecture.md §10). No page, component, Server
 * Action, or `lib/data/*` function ever imports a Supabase client
 * directly; every `lib/data/*` module-level function resolves the current
 * DataSource (via `resolve.ts`, cached per request) and delegates to it.
 *
 * This is what makes demo-mode isolation structural rather than
 * conventional: a new query has NO OTHER WAY to reach `loads`/`trips`/etc.
 * except through a method on this interface, and the only two
 * implementations are `live-data-source.ts` (wraps
 * `createServiceRoleClient()`, real reads) and `demo-data-source.ts`
 * (reads the static in-memory demo dataset, never touches Supabase). There
 * is no `createServiceRoleClient()` import available to reach for by
 * mistake outside `live-data-source.ts`.
 *
 * Read-only for now — Phase 2 ships no mutations. When the first Server
 * Action lands (a later phase), its method is added here first and both
 * implementations grow it together, keeping the interface the literal
 * contract instead of an aspiration one implementation might skip.
 */

import type { Paginated } from "@/lib/data/pagination";
import type { LoadWithFinancials, ListLoadsOptions } from "@/lib/data/loads";
import type { TripWithFinancials, ListTripsOptions } from "@/lib/data/trips";
import type { ExpenseRow, ListExpensesOptions } from "@/lib/data/expenses";
import type { BrokerRow, ListBrokersOptions } from "@/lib/data/brokers";
import type { TodaySummary } from "@/lib/data/dashboard";
import type { FuelSettings } from "@/lib/domain/money";

export interface DataSource {
  listLoads(opts: ListLoadsOptions): Promise<Paginated<LoadWithFinancials>>;
  getLoadById(id: string): Promise<LoadWithFinancials | null>;
  listActiveLoads(limit: number): Promise<LoadWithFinancials[]>;

  listTrips(opts: ListTripsOptions): Promise<Paginated<TripWithFinancials>>;
  getTripById(id: string): Promise<TripWithFinancials | null>;

  listExpenses(opts: ListExpensesOptions): Promise<Paginated<ExpenseRow>>;

  listBrokers(opts: ListBrokersOptions): Promise<Paginated<BrokerRow>>;
  getBrokerById(id: string): Promise<BrokerRow | null>;

  getFuelSettings(): Promise<FuelSettings>;

  getTodaySummary(): Promise<TodaySummary>;
}
