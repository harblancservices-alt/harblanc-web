import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";

/**
 * SNAPSHOT — server reads for the BOL scanner.
 *
 * ── WHAT THIS FEATURE IS, AND WHAT IT REFUSES TO BE ───────────────────
 *
 * Brent props his phone up, puts a bill of lading underneath, taps, swaps
 * the paper, taps again — four hundred times in a sitting. Snapshot captures
 * and stores those photos. It does NOT parse them, OCR them, create
 * companies from them, or release anything. A separate Claude session reads
 * the batch afterwards. Every temptation to be clever here costs Brent shots
 * per minute, which is the only number this screen is judged on.
 *
 * ── WHY ITS OWN TABLES ────────────────────────────────────────────────
 *
 * crm_documents was the obvious home and is the wrong one. It carries six
 * attachment FKs (account, deal, shipment, rate_confirmation,
 * bill_of_lading) that are all meaningless for a photo belonging to nothing
 * yet, and the parse lifecycle these rows need — parsed_at, parse_status —
 * would sit dead on every RC and packet row in the org. Four hundred rows a
 * sitting would also flood a table five other features query.
 *
 * STORAGE is unchanged: the same private "crm-documents" bucket, and the
 * path still starts with org_id, so the existing storage policy covers it
 * with no new policy — the same reasoning commodity-photo-actions.ts records
 * for its own path.
 *
 * ── SIGNING, AND WHY THE PAGE SIZE EXISTS ─────────────────────────────
 *
 * The bucket is private, so a thumbnail needs a signed URL, and signing is
 * per-object work. Signing four hundred to render one screen is the obvious
 * way to kill this page. The file area therefore pages, and only the current
 * page is signed — one batched createSignedUrls call per page.
 */

export const STORAGE_BUCKET = "crm-documents";

/** Short TTL for on-screen thumbnails — matches admin/documents-data.ts. */
const SIGNED_URL_TTL_SECONDS = 300;

/** The manifest is handed to a parsing session that may work through four
 * hundred images over an afternoon, so its links outlive the page's. */
export const MANIFEST_TTL_SECONDS = 60 * 60 * 12;

/** How many photos one page of the file area renders — and therefore how
 * many signed URLs a single request asks for. */
export const SNAPSHOT_PAGE_SIZE = 60;

export type SnapshotBatch = {
  id: string;
  label: string;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Live counts, so the index can say "312 shots, 0 parsed" without the
   * caller loading a single photo row. */
  total: number;
  parsed: number;
};

export type SnapshotRow = {
  id: string;
  seq: number;
  fileName: string;
  storagePath: string;
  capturedAt: string;
  parsedAt: string | null;
  /** Null when signing failed — the tile falls back to a filename chip
   * rather than a broken image. */
  url: string | null;
};

/** Every batch in the org, newest first, with its counts. */
export async function listBatches(): Promise<SnapshotBatch[]> {
  const supabase = await createCrmServerClient();

  const { data } = await supabase
    .from("crm_snapshot_batches")
    .select("id, label, note, created_at, closed_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const batches = (data ?? []) as {
    id: string;
    label: string;
    note: string | null;
    created_at: string;
    closed_at: string | null;
  }[];
  if (batches.length === 0) return [];

  // Counts come from one pass over the id/parsed_at pairs rather than two
  // COUNT queries per batch — at 200 batches that would be 400 round trips.
  const { data: countRows } = await supabase
    .from("crm_snapshots")
    .select("batch_id, parsed_at")
    .in("batch_id", batches.map((b) => b.id))
    .is("deleted_at", null);

  const totals = new Map<string, { total: number; parsed: number }>();
  for (const r of (countRows ?? []) as { batch_id: string; parsed_at: string | null }[]) {
    const entry = totals.get(r.batch_id) ?? { total: 0, parsed: 0 };
    entry.total += 1;
    if (r.parsed_at) entry.parsed += 1;
    totals.set(r.batch_id, entry);
  }

  return batches.map((b) => ({
    id: b.id,
    label: b.label,
    note: b.note,
    createdAt: b.created_at,
    closedAt: b.closed_at,
    total: totals.get(b.id)?.total ?? 0,
    parsed: totals.get(b.id)?.parsed ?? 0,
  }));
}

export async function getBatch(batchId: string): Promise<SnapshotBatch | null> {
  const supabase = await createCrmServerClient();
  const { data } = await supabase
    .from("crm_snapshot_batches")
    .select("id, label, note, created_at, closed_at")
    .eq("id", batchId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;

  const { count } = await supabase
    .from("crm_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("deleted_at", null);

  const { count: parsedCount } = await supabase
    .from("crm_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("deleted_at", null)
    .not("parsed_at", "is", null);

  return {
    id: data.id as string,
    label: data.label as string,
    note: (data.note as string | null) ?? null,
    createdAt: data.created_at as string,
    closedAt: (data.closed_at as string | null) ?? null,
    total: count ?? 0,
    parsed: parsedCount ?? 0,
  };
}

/**
 * One page of a batch's photos, newest first, each with a signed thumbnail
 * URL. Newest first because the shot you want to check or delete is almost
 * always the one you just took.
 */
export async function listSnapshots(
  batchId: string,
  page: number,
): Promise<{ rows: SnapshotRow[]; total: number; page: number; pageCount: number }> {
  const supabase = await createCrmServerClient();

  const { count } = await supabase
    .from("crm_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("deleted_at", null);

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SNAPSHOT_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = (safePage - 1) * SNAPSHOT_PAGE_SIZE;

  const { data } = await supabase
    .from("crm_snapshots")
    .select("id, seq, file_name, storage_path, captured_at, parsed_at")
    .eq("batch_id", batchId)
    .is("deleted_at", null)
    .order("seq", { ascending: false })
    .range(from, from + SNAPSHOT_PAGE_SIZE - 1);

  const rows = (data ?? []) as {
    id: string;
    seq: number;
    file_name: string;
    storage_path: string;
    captured_at: string;
    parsed_at: string | null;
  }[];

  const signed = await signPaths(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      fileName: r.file_name,
      storagePath: r.storage_path,
      capturedAt: r.captured_at,
      parsedAt: r.parsed_at,
      url: signed.get(r.storage_path) ?? null,
    })),
    total,
    page: safePage,
    pageCount,
  };
}

/** One batched signing call. Per-item failures come back as a missing entry
 * rather than throwing, which is why callers treat a null URL as normal. */
export async function signPaths(
  paths: string[],
  ttlSeconds: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const supabase = await createCrmServerClient();
  const { data } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, ttlSeconds);
  for (const s of data ?? []) {
    if (s.signedUrl && s.path) out.set(s.path, s.signedUrl);
  }
  return out;
}

/** Only owners reach Snapshot — it sits under Admin Account. */
export async function requireSnapshotAdmin() {
  const user = await requireCrmUser();
  return { user, isOwner: user.role === "owner" };
}
