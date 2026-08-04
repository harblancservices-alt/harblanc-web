/**
 * Typed, paginated query module for `load_expenses` (v2-architecture.md
 * §3c). See loads.ts's header — same DataSource-delegation contract.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Paginated } from "./pagination";
import type { Period } from "@/lib/domain/attribution";

export type ExpenseRow = {
  id: string;
  loadId: string;
  category: string | null;
  amount: number;
  note: string | null;
  createdAt: string | null;
};

export type ListExpensesOptions = {
  page?: number;
  pageSize?: number;
  loadId?: string;
  /** Scopes by the expense's own created_at (expenses don't carry a
   * pickup_date of their own — they're attributed to their load's period
   * on the load's P&L, but this list itself is a raw ledger view). */
  period?: Period;
};

export async function listExpenses(opts: ListExpensesOptions = {}): Promise<Paginated<ExpenseRow>> {
  const ds = await resolveDataSource();
  return ds.listExpenses(opts);
}
