"use server";

import { revalidatePath } from "next/cache";
import { createCrmServerClient, requireCrmUser } from "@/lib/crm/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * SNAPSHOT — the two writes. Save a photo, delete a photo. That is the
 * whole feature.
 *
 * ── NOTHING HERE TOUCHES ANYTHING ELSE ────────────────────────────────
 *
 * Brent settled it: "we shouldnt have the BOLs unparsed in the work to
 * assign. So JUST have the BOLs save into the snapshot." So a captured
 * photo writes exactly one row in crm_snapshots and nothing else. It does
 * not create a company, does not write crm_accounts, does not enter the
 * assign pool, does not log an activity. Work to assign stays what it is:
 * unowned COMPANIES, and a photograph is not a company until something
 * reads it.
 */

/**
 * Record one captured photo. The browser has already put the file in
 * storage — it never passes through the server, the same mechanism the BOL
 * tab and commodity photos use.
 *
 * THE NUMBER IS NOT SENT FROM HERE. It is assigned inside the database by
 * the crm_snapshots_assign_number trigger, which increments a per-org
 * counter row with UPDATE ... RETURNING. That row lock is what makes
 * concurrent capture safe: two photos uploading at once serialise on it and
 * cannot take the same number. A client-side counter or a
 * `select max(number) + 1` here would race, and Brent shoots fast.
 *
 * The assigned number comes back so the list can show it immediately
 * without a page refresh.
 */
export async function recordSnapshot(input: {
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<{ ok: true; id: string; number: number; createdAt: string } | { ok: false; error: string }> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();
  const { data, error } = await supabase
    .from("crm_snapshots")
    .insert({
      org_id: user.orgId,
      user_id: user.id,
      file_name: input.fileName,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
    })
    .select("id, number, created_at")
    .single();

  if (error || !data) return { ok: false, error: "Could not save that photo." };

  return {
    ok: true,
    id: data.id as string,
    number: data.number as number,
    createdAt: data.created_at as string,
  };
}

/**
 * Delete a photo.
 *
 * Soft, like every other document delete in the CRM — the storage object
 * stays and is recoverable. It also means the NUMBER stays taken: deleting
 * #7 leaves a permanent gap and #8 does not move down. That is deliberate
 * and it is the point. Brent says "parse 1 through 20" out loud, and an
 * instruction that means something different tomorrow than it did today is
 * worse than no numbering at all.
 */
export async function deleteSnapshot(id: string): Promise<ActionResult> {
  const user = await requireCrmUser();
  if (user.role !== "owner") return { ok: false, error: "Admins only." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_snapshots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not delete that photo." };
  revalidatePath("/crm/admin/snapshot");
  return { ok: true };
}
