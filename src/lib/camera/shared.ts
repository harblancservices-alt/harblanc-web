/**
 * Camera feature — CLIENT-SAFE shared helpers + types.
 *
 * Kept free of any server-only import (no supabase/server, no next/headers) so
 * both client components and server code can import from here. The server-only
 * data loaders live in ./batches; export byte-loading in ./export.
 */

/** Reused document bucket + camera path namespace. */
export const CAMERA_BUCKET = "load-documents";
export const CAMERA_PREFIX = "camera";

/** Signed-URL lifetime for viewing photos (seconds) — matches the Files page. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Sequential display name for a shot, from its 1-based ORDINAL position in the
 * batch (not its stored `seq`): "BOL-001", "BOL-002", … Zero-padded to 3.
 * Positional so deleting a bad shot renumbers the rest and stays contiguous.
 */
export function bolName(ordinal: number): string {
  return `BOL-${String(ordinal).padStart(3, "0")}`;
}

/**
 * Table not migrated yet. Covers both raw Postgres ("relation … does not
 * exist", 42P01) and the PostgREST/supabase-js schema-cache miss the app
 * actually sees ("Could not find the table … in the schema cache", PGRST205).
 */
export function isMissingTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = error.message ?? "";
  return /does not exist/i.test(msg) || /schema cache/i.test(msg);
}

export type BatchSummary = {
  id: string;
  name: string;
  createdAt: string;
  photoCount: number;
};

export type BatchPhoto = {
  id: string;
  seq: number;
  storagePath: string;
  /** Display name from ordinal position, e.g. "BOL-001". */
  name: string;
  /** Signed URL for viewing (may be null if signing failed). */
  url: string | null;
};

export type BatchDetail = {
  id: string;
  name: string;
  createdAt: string;
  photos: BatchPhoto[];
};
