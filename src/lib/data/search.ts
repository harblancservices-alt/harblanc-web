/**
 * Global search (⌘K) — bounded ilike lookup across the two entities worth
 * jumping straight to: loads (by #) and brokers (by name). Deliberately
 * narrow scope for this foundation phase (not a full-text index across
 * every table) — same "bounded, not unbounded" discipline as
 * lib/data/attention.ts's LOADS_SCAN_CAP. Demo-mode branches over the
 * in-memory dataset rather than reaching Supabase, matching every other
 * /tms-v2 data module.
 */

import { isDemoMode } from "@/lib/admin/demo";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildDemoData, DEMO_BROKERS } from "@/lib/demo/demo-dataset";

export type SearchHit = { id: string; label: string; sublabel: string; href: string };
export type SearchResults = { loads: SearchHit[]; brokers: SearchHit[] };

const RESULT_LIMIT = 6;

export async function searchWorkspace(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return { loads: [], brokers: [] };

  if (await isDemoMode()) {
    const needle = q.toLowerCase();
    const { loads } = buildDemoData();
    const brokerNameById = new Map(DEMO_BROKERS.map((b) => [b.id, b.name]));
    const loadHits = loads
      .filter((l) => l.loadNumber.toLowerCase().includes(needle))
      .slice(0, RESULT_LIMIT)
      .map((l) => ({
        id: l.id,
        label: `#${l.loadNumber}`,
        sublabel: `${brokerNameById.get(l.brokerId) ?? "—"} · ${l.origin} → ${l.destination}`,
        href: `/tms-v2/loads/${l.id}`,
      }));
    const brokerHits = DEMO_BROKERS.filter((b) => b.name.toLowerCase().includes(needle))
      .slice(0, RESULT_LIMIT)
      .map((b) => ({ id: b.id, label: b.name, sublabel: "Broker", href: `/tms-v2/brokers/${b.id}` }));
    return { loads: loadHits, brokers: brokerHits };
  }

  const sb = createServiceRoleClient();
  const [{ data: loadRows }, { data: brokerRows }] = await Promise.all([
    sb
      .from("loads")
      .select("id, load_number, origin, destination, broker_name")
      .is("deleted_at", null)
      .ilike("load_number", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT)
      .returns<{ id: string; load_number: string | null; origin: string | null; destination: string | null; broker_name: string | null }[]>(),
    sb
      .from("brokers")
      .select("id, name")
      .is("deleted_at", null)
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(RESULT_LIMIT)
      .returns<{ id: string; name: string }[]>(),
  ]);

  return {
    loads: (loadRows ?? []).map((l) => ({
      id: l.id,
      label: l.load_number ? `#${l.load_number}` : l.id.slice(0, 8),
      sublabel: `${l.broker_name ?? "—"} · ${l.origin ?? "—"} → ${l.destination ?? "—"}`,
      href: `/tms-v2/loads/${l.id}`,
    })),
    brokers: (brokerRows ?? []).map((b) => ({ id: b.id, label: b.name, sublabel: "Broker", href: `/tms-v2/brokers/${b.id}` })),
  };
}
