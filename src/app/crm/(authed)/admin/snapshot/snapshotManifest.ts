/**
 * SNAPSHOT — the two pure decisions, kept out of React and out of the
 * database so they can be tested directly: what a new batch is called, and
 * what the parsing session is handed.
 *
 * No React, no Supabase, no clock of its own — `now` always arrives as an
 * argument, which is both the React Compiler purity rule and the only way
 * these are testable.
 */

/** One photo as the parsing session sees it. */
export type ManifestItem = {
  id: string;
  /** Shooting order within the batch. A multi-page BOL is consecutive
   * shots, so this is not decoration — it is how pages stay together. */
  seq: number;
  fileName: string;
  storagePath: string;
  capturedAt: string;
  /** Time-limited download link. Null when signing failed for that object;
   * the session should re-request rather than treat the photo as missing. */
  url: string | null;
};

export type Manifest = {
  batch: {
    id: string;
    label: string;
    note: string | null;
    createdAt: string;
    closedAt: string | null;
  };
  /** What the reader must do, stated in the file rather than assumed. */
  contract: string;
  generatedAt: string;
  urlsExpireAt: string;
  counts: { total: number; unparsed: number };
  items: ManifestItem[];
};

/**
 * The contract travels WITH the manifest. A parsing session opens this JSON
 * cold, with no memory of this conversation, and the two things it can get
 * catastrophically wrong are re-parsing photos somebody already did and
 * writing to tables it was never meant to touch. Saying so costs one string.
 */
export const MANIFEST_CONTRACT =
  "Parse each item and record the result yourself. Mark a photo done by " +
  "setting crm_snapshots.parsed_at (and parse_status='parsed', or " +
  "'failed' with parse_error) so it is never parsed twice. This manifest " +
  "lists ONLY unparsed photos. Do not modify crm_accounts or crm_documents " +
  "from this batch without a separate instruction.";

/**
 * Build the handoff. Unparsed only, in shooting order.
 *
 * Ascending seq — the opposite of the file area, which shows newest first
 * because you are checking the shot you just took. A reader works forwards
 * through the stack in the order it was photographed.
 */
export function buildManifest(input: {
  batch: { id: string; label: string; note: string | null; createdAt: string; closedAt: string | null };
  items: ManifestItem[];
  total: number;
  now: Date;
  ttlSeconds: number;
}): Manifest {
  const items = [...input.items].sort((a, b) => a.seq - b.seq);
  return {
    batch: input.batch,
    contract: MANIFEST_CONTRACT,
    generatedAt: input.now.toISOString(),
    urlsExpireAt: new Date(input.now.getTime() + input.ttlSeconds * 1000).toISOString(),
    counts: { total: input.total, unparsed: items.length },
    items,
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * A default name for a new batch: the date, plus a letter when there is
 * already one from today.
 *
 * Brent will shoot more than one sitting in a day and a parsing session has
 * to be told which one to read. "27 Aug — B" is something a person can say
 * out loud; a uuid is not. Uniqueness still lives on the id — this is a
 * handle, not a key, and it stays editable.
 */
export function defaultBatchLabel(now: Date, existingLabels: string[]): string {
  const day = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "America/Chicago",
  });
  const taken = new Set(existingLabels);
  if (!taken.has(day)) return day;
  for (const letter of LETTERS) {
    const candidate = `${day} — ${letter}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 27 sittings in one day. Fall back to something unique rather than
  // returning a duplicate.
  return `${day} — ${now.toISOString().slice(11, 19)}`;
}
