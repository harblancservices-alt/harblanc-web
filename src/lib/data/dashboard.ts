/**
 * The Today (dashboard) aggregate — one bounded call that assembles
 * everything the Today page renders: this-period KPIs (via the money
 * engine), active loads, and overdue-receivable attention items (via the
 * one carrier-A/R rule). v2-architecture.md §6 notes this kind of
 * aggregate is exactly where a short-TTL/segment cache belongs once real
 * traffic justifies it; for a one-operator app reading it live on every
 * visit is the correct default.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Period } from "@/lib/domain/attribution";
import type { LoadWithFinancials } from "./loads";
import type { CarrierARItem } from "@/lib/domain/money";

export type AttentionReceivable = CarrierARItem & {
  loadNumber: string | null;
  brokerName: string | null;
  deliveryDate: string | null;
};

export type TodaySummary = {
  period: Period;
  periodLabel: string;
  /** This period's gross/net, summed via computeLoadNet over every load
   * attributed to it — the same figures the Load Board's KPI strip will
   * show once it's wired, by construction (same query + same engine). */
  gross: number;
  net: number;
  loadsCount: number;
  /** Total outstanding carrier A/R across every closed-out, unpaid load —
   * not scoped to the period (a receivable stays owed regardless of which
   * month it's viewed in). */
  arTotal: number;
  activeLoads: LoadWithFinancials[];
  /** Unpaid, closed-out loads at/over the 40-day overdue threshold —
   * today's "needs attention" list. */
  overdueReceivables: AttentionReceivable[];
};

export async function getTodaySummary(): Promise<TodaySummary> {
  const ds = await resolveDataSource();
  return ds.getTodaySummary();
}
