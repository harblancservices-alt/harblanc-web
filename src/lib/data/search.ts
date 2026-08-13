/**
 * Global search (⌘K) — bounded ilike lookup across loads, brokers, and
 * files. Deliberately narrow scope (not a full-text index across every
 * table) — same "bounded, not unbounded" discipline as
 * lib/data/attention.ts's LOADS_SCAN_CAP.
 *
 * Phase 6 item 9 widened this from single-field (load_number only, name
 * only) to multi-field per entity, and added the Files group reusing
 * lib/admin/files.ts's loadAllFiles()/searchText — the same aggregation
 * and search-blob the Files page itself already searches, not a second
 * implementation of "what counts as a file."
 */

import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadAllFiles } from "@/lib/admin/files";

export type SearchHit = { id: string; label: string; sublabel: string; href: string };
export type SearchResults = { loads: SearchHit[]; brokers: SearchHit[]; files: SearchHit[] };

const RESULT_LIMIT = 6;
const EMPTY: SearchResults = { loads: [], brokers: [], files: [] };

export async function searchWorkspace(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const sb = createServiceRoleClient();
  // PostgREST's .or() filter syntax uses "," and "()" as its own delimiters
  // — strip them from the needle so a query containing one can't corrupt
  // the filter expression (single-field .ilike() calls never had this
  // exposure; the multi-field .or() composite does).
  const safeQ = q.replace(/[,()]/g, " ").trim();
  const orIlike = (cols: string[]) => cols.map((c) => `${c}.ilike.%${safeQ}%`).join(",");

  const [{ data: loadRows }, { data: brokerRows }, allFiles] = await Promise.all([
    safeQ.length === 0
      ? Promise.resolve({ data: [] as { id: string; load_number: string | null; origin: string | null; destination: string | null; broker_name: string | null }[] })
      : sb
          .from("loads")
          .select("id, load_number, origin, destination, broker_name")
          .is("deleted_at", null)
          .or(orIlike(["load_number", "broker_name", "origin", "destination"]))
          .order("created_at", { ascending: false })
          .limit(RESULT_LIMIT)
          .returns<{ id: string; load_number: string | null; origin: string | null; destination: string | null; broker_name: string | null }[]>(),
    safeQ.length === 0
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : sb
          .from("brokers")
          .select("id, name")
          .is("deleted_at", null)
          .or(orIlike(["name", "mc_number", "dot_number", "phone", "email"]))
          .order("name", { ascending: true })
          .limit(RESULT_LIMIT)
          .returns<{ id: string; name: string }[]>(),
    loadAllFiles().catch(() => []),
  ]);

  const needle = q.toLowerCase();
  const fileHits = allFiles
    .filter((f) => f.searchText.includes(needle))
    .slice(0, RESULT_LIMIT)
    .map((f) => ({ id: f.id, label: f.name, sublabel: `${f.typeLabel} · ${f.subtitle}`, href: f.parentHref }));

  return {
    loads: (loadRows ?? []).map((l) => ({
      id: l.id,
      label: l.load_number ? `#${l.load_number}` : l.id.slice(0, 8),
      sublabel: `${l.broker_name ?? "—"} · ${l.origin ?? "—"} → ${l.destination ?? "—"}`,
      href: `/tms-v2/loads/${l.id}`,
    })),
    brokers: (brokerRows ?? []).map((b) => ({ id: b.id, label: b.name, sublabel: "Broker", href: `/tms-v2/brokers/${b.id}` })),
    files: fileHits,
  };
}
