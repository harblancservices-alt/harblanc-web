"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadAllFiles } from "@/lib/admin/files";

/**
 * Global search — the portal's one search box, behind the top bar's search
 * icon (and the mobile nav's Search tab). Runs three searches in parallel and
 * returns them already grouped: Loads, Brokers, Files.
 *
 * Read-only, so there is no revalidatePath fan-out and no auth guard of its
 * own — middleware gates /admin/** and the (authed) layout resolves the admin
 * once, the same contract every other action under this group relies on.
 *
 * Each group is capped (GROUP_CAP) because this is a jump-to-record palette,
 * not a report: you type enough to see the thing you want and hit Enter. The
 * caps are what keep a two-letter query from dragging the whole loads table
 * across the wire on every keystroke.
 */

/** Per-group result cap. Ten is about one phone screen per group. */
const GROUP_CAP = 10;

/** Below this we don't search at all — one character matches everything. */
const MIN_QUERY = 2;

export type SearchHit = {
  id: string;
  /** Row 1 — the thing's name. */
  title: string;
  /** Row 2 — how you tell two same-named things apart. */
  subtitle: string;
  /** Short right-aligned tag (status, doc type, MC number…). */
  meta: string | null;
  href: string;
};

export type SearchResults = {
  /** Echoed back so the client can discard responses for a stale query. */
  query: string;
  loads: SearchHit[];
  brokers: SearchHit[];
  files: SearchHit[];
};

const EMPTY = (query: string): SearchResults => ({
  query,
  loads: [],
  brokers: [],
  files: [],
});

/**
 * PostgREST parses `.or()` as a comma-separated list with parenthesised
 * groups, so a raw user string containing , ( ) or . corrupts the filter
 * rather than matching literally. `%` and `_` are ilike wildcards and `\` is
 * ilike's escape. All of them become spaces — a load number is alphanumeric
 * and a city is letters, so nothing searchable is lost.
 */
function sanitize(q: string): string {
  return q.replace(/[,()%_\\*."':]/g, " ").replace(/\s+/g, " ").trim();
}

const LOAD_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  assigned: "Rolling",
  loaded: "Loaded",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

type LoadHitRow = {
  id: string;
  load_number: string | null;
  broker_name: string | null;
  origin: string | null;
  destination: string | null;
  status: string | null;
  created_at: string | null;
};

type BrokerHitRow = {
  id: string;
  name: string | null;
  mc_number: string | null;
  dot_number: string | null;
  status: string | null;
};

export async function globalSearch(rawQuery: string): Promise<SearchResults> {
  const query = (rawQuery ?? "").trim();
  const safe = sanitize(query);
  if (safe.length < MIN_QUERY) return EMPTY(query);

  const like = `%${safe}%`;
  const sb = createServiceRoleClient();

  // The three searches are independent — fired together so the palette waits
  // on the slowest, not on their sum.
  const [loadRes, brokerRes, allFiles] = await Promise.all([
    sb
      .from("loads")
      .select(
        "id,load_number,broker_name,origin,destination,status,created_at",
      )
      .is("deleted_at", null)
      .or(
        [
          `load_number.ilike.${like}`,
          `broker_name.ilike.${like}`,
          `origin.ilike.${like}`,
          `destination.ilike.${like}`,
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(GROUP_CAP)
      .returns<LoadHitRow[]>(),
    sb
      .from("brokers")
      .select("id,name,mc_number,dot_number,status")
      .is("deleted_at", null)
      .or(
        [
          `name.ilike.${like}`,
          `mc_number.ilike.${like}`,
          `dot_number.ilike.${like}`,
        ].join(","),
      )
      .order("name", { ascending: true })
      .limit(GROUP_CAP)
      .returns<BrokerHitRow[]>(),
    // Files have no single table — load documents, maintenance receipts and
    // intake uploads live in three schemas with different column names. The
    // Files page's aggregator already normalizes them AND builds the same
    // lowercased searchText blob its own search box matches on, so reusing it
    // keeps global search and the Files page agreeing on what "matches".
    loadAllFiles(),
  ]);

  const tokens = safe.toLowerCase().split(" ").filter(Boolean);
  const files = allFiles
    .filter((f) => tokens.every((t) => f.searchText.includes(t)))
    .slice(0, GROUP_CAP)
    .map<SearchHit>((f) => ({
      id: f.id,
      title: f.name,
      subtitle: f.subtitle,
      meta: f.typeLabel,
      // Opens the Files timeline scrolled to this file by seeding its search
      // box with the file's own name — the file is then one tap from the
      // viewer, and its parent record stays reachable from the same row.
      href: `/admin/files?q=${encodeURIComponent(f.name)}`,
    }));

  const loads = (loadRes.data ?? []).map<SearchHit>((r) => ({
    id: r.id,
    title: r.broker_name?.trim() || "Load",
    subtitle: [r.origin, r.destination].filter(Boolean).join(" → ") || "—",
    meta: r.load_number?.trim()
      ? `#${r.load_number.trim()}`
      : (LOAD_STATUS_LABEL[r.status ?? ""] ?? null),
    href: `/admin/dispatch/loads/${r.id}`,
  }));

  const brokers = (brokerRes.data ?? []).map<SearchHit>((r) => ({
    id: r.id,
    title: r.name?.trim() || "Broker",
    subtitle:
      [
        r.mc_number ? `MC ${r.mc_number}` : null,
        r.dot_number ? `DOT ${r.dot_number}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No MC/DOT on file",
    meta: r.status?.trim() || null,
    href: `/admin/dispatch/brokers/${r.id}`,
  }));

  return { query, loads, brokers, files };
}
