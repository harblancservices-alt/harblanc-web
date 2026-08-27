import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";

/**
 * SNAPSHOT — the read. There is one.
 *
 * Brent cut this feature back to its bones: "It's just a photo capture at
 * the top and then on the bottom it's just a list. That's it. It's just a
 * list of files. There's no photo preview, there's no nothing. It's just a
 * list that gets bigger as it goes. There shouldn't be any buttons besides
 * delete."
 *
 * So: no batches, no parse state, no manifest, no thumbnails, no ranges,
 * no refresh button. What was built before this was all of those things,
 * and it is gone rather than hidden behind a flag.
 *
 * ── NO SIGNED URLS, WHICH IS WHY THE WHOLE LIST CAN RENDER ────────────
 *
 * The previous version paged at sixty because the bucket is private and a
 * thumbnail needs a signed URL — signing four hundred objects to draw one
 * screen is what would have killed the page. With no previews there is
 * nothing to sign, so the list is text and four hundred rows cost nothing.
 * That is why there is no pagination control, which is just as well,
 * because a pagination control is a button and there is only one button.
 */

export const STORAGE_BUCKET = "crm-documents";

export type SnapshotRow = {
  id: string;
  /** The permanent, org-wide number Brent says out loud. Assigned once by
   * a database trigger and never recomputed — see the migration. */
  number: number;
  fileName: string;
  createdAt: string;
};

/**
 * Every photo, newest first.
 *
 * The cap is a runaway guard, not a page size. At four hundred a sitting
 * Brent would have to shoot for weeks to reach it, and if he ever does the
 * list is truncated rather than the page dying — but the numbers on screen
 * would stop matching what he expects, so it is worth knowing about. That
 * is what `truncated` is for.
 */
export async function listSnapshots(): Promise<{ rows: SnapshotRow[]; truncated: boolean }> {
  const supabase = await createCrmServerClient();
  const LIMIT = 2000;

  const { data } = await supabase
    .from("crm_snapshots")
    .select("id, number, file_name, created_at")
    .is("deleted_at", null)
    .order("number", { ascending: false })
    .limit(LIMIT + 1);

  const raw = (data ?? []) as {
    id: string;
    number: number;
    file_name: string;
    created_at: string;
  }[];

  return {
    rows: raw.slice(0, LIMIT).map((r) => ({
      id: r.id,
      number: r.number,
      fileName: r.file_name,
      createdAt: r.created_at,
    })),
    truncated: raw.length > LIMIT,
  };
}

/** Snapshot sits under Admin Account, so only owners reach it. */
export async function requireSnapshotAdmin() {
  const user = await requireCrmUser();
  return { user, isOwner: user.role === "owner" };
}
