/**
 * Typed, paginated query module for `brokers` (v2-architecture.md §3c).
 * See loads.ts's header — same DataSource-delegation contract.
 */

import { resolveDataSource } from "@/lib/demo/resolve";
import type { Paginated } from "./pagination";

export type BrokerRow = {
  id: string;
  name: string;
  status: string;
  mcNumber: string | null;
  dotNumber: string | null;
  phone: string | null;
  email: string | null;
  factoring: boolean;
};

export type ListBrokersOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export async function listBrokers(opts: ListBrokersOptions = {}): Promise<Paginated<BrokerRow>> {
  const ds = await resolveDataSource();
  return ds.listBrokers(opts);
}

export async function getBrokerById(id: string): Promise<BrokerRow | null> {
  const ds = await resolveDataSource();
  return ds.getBrokerById(id);
}
