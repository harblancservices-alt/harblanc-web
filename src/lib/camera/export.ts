import { createServiceRoleClient } from "@/lib/supabase/server";
import { CAMERA_BUCKET, bolName, isMissingTable } from "./shared";

/**
 * Camera export — load a batch's photos (in order) and pull their bytes from
 * storage, ready for PDF/ZIP assembly. Names are positional ("BOL-001.jpg" …).
 * Returns null if the batch/tables don't exist.
 */

export type ExportImage = { name: string; bytes: Uint8Array };
export type ExportData = { batchName: string; images: ExportImage[] };

/** Filesystem-safe slug for a download filename. */
export function safeFilename(name: string): string {
  const slug = (name || "batch")
    .trim()
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "batch";
}

export async function loadBatchForExport(
  batchId: string,
): Promise<ExportData | null> {
  const sb = createServiceRoleClient();

  const { data: batch, error: batchErr } = await sb
    .from("camera_batches")
    .select("id, name")
    .eq("id", batchId)
    .maybeSingle<{ id: string; name: string }>();
  if (batchErr) {
    if (isMissingTable(batchErr)) return null;
    console.error("[camera export] batch load failed:", batchErr);
    return null;
  }
  if (!batch) return null;

  const { data: rows, error: photoErr } = await sb
    .from("camera_photos")
    .select("storage_path")
    .eq("batch_id", batchId)
    .order("seq", { ascending: true })
    .returns<{ storage_path: string }[]>();
  if (photoErr && !isMissingTable(photoErr)) {
    console.error("[camera export] photos load failed:", photoErr);
  }
  const paths = (rows ?? []).map((r) => r.storage_path);

  const images: ExportImage[] = [];
  for (let i = 0; i < paths.length; i++) {
    const { data: blob, error } = await sb.storage
      .from(CAMERA_BUCKET)
      .download(paths[i]);
    if (error || !blob) {
      console.error("[camera export] download failed:", paths[i], error);
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    images.push({ name: `${bolName(i + 1)}.jpg`, bytes });
  }

  return { batchName: batch.name, images };
}
