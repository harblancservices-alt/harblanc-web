"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { ORG_UPLOAD_KIND, STORAGE_BUCKET, TEMPLATE_KINDS, THUMB_SUFFIX } from "../documents-data";

/** Titles are editable for both uploads AND the two blank templates —
 * deletion stays upload-only (see deleteOrgDocument below). */
const RENAMEABLE_KINDS = [ORG_UPLOAD_KIND, ...TEMPLATE_KINDS];
import type { ActionResult } from "../types";

/**
 * Admin Account "Documents" tab — org-level uploads (insurance certs, W9s,
 * agreements). The two blank master templates (../documents-data.ts's
 * BLANK_TEMPLATES) are read-only and not managed here. Every write
 * independently re-verifies role==='owner' itself, per this repo's
 * crm/admin/**\/actions.ts convention — never trusts the page/layout gate
 * alone.
 */

async function requireAdminUser() {
  const user = await requireCrmUser();
  if (user.role !== "owner") throw new Error("Only an admin can manage Documents.");
  return user;
}

function revalidateDocuments() {
  revalidatePath("/crm/admin/documents");
}

export async function createOrgDocument(input: {
  fileName: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase.from("crm_documents").insert({
    org_id: user.orgId,
    account_id: null,
    deal_id: null,
    user_id: user.id,
    kind: ORG_UPLOAD_KIND,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
  });

  if (error) return { ok: false, error: "Could not save the file record. Please try again." };

  await writeThumbnail(supabase, input.storagePath, input.mimeType, input.fileName);

  revalidateDocuments();
  return { ok: true };
}

/**
 * Renders the `<storagePath>.thumb.v3.png` sibling for a newly uploaded PDF.
 *
 * RESTORED, not new. The old Settings→Documents upload path
 * (settings/documents-actions.ts) did exactly this on every upload; commit
 * 966cc15 replaced that section with this one and the step was dropped, so
 * from then on every admin upload landed with no thumbnail and the card fell
 * through to a generic file glyph — read, correctly, as a broken image.
 * Same `.thumb.v3.png` convention and the same renderer as before, so old
 * and new rows are indistinguishable to ../documents-data.ts.
 *
 * BEST-EFFORT, ALWAYS. Every failure is swallowed: the file is already in
 * Storage and its row is already inserted by the time this runs, so throwing
 * here would fail an upload that actually succeeded. A missing thumbnail is
 * invisible anyway — _shell/DocThumb.tsx rasters the first page in the
 * browser instead.
 *
 * renderPdfFirstPageToPng is imported LAZILY: it pulls @napi-rs/canvas, a
 * native prebuilt-binary module, and a load failure for one of those at
 * module scope can poison every export of a "use server" file (the exact
 * Vercel regression `sharp` caused once here already). Images get no
 * sibling on purpose — an image is its own thumbnail, and DocThumb renders
 * the original directly.
 */
async function writeThumbnail(
  supabase: Awaited<ReturnType<typeof createCrmServerClient>>,
  storagePath: string,
  mimeType: string | null,
  fileName: string,
): Promise<void> {
  const isPdf =
    mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  if (!isPdf) return;

  try {
    const { data: pdfBlob } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    if (!pdfBlob) return;

    const { renderPdfFirstPageToPng } = await import("@/lib/pdf/pdfPageThumbnail");
    const result = await renderPdfFirstPageToPng(new Uint8Array(await pdfBlob.arrayBuffer()));
    if (!result.ok) return;

    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(`${storagePath}${THUMB_SUFFIX}`, result.png, {
        contentType: "image/png",
        upsert: true,
      });
  } catch (e) {
    console.error("[admin documents] thumbnail generation failed:", storagePath, e);
  }
}

/** Renames a document's display name (file_name) only — the storage object
 * and its path are untouched, so this never risks breaking the signed-URL
 * lookup. Allows both upload AND template kinds (titles are editable for
 * both); deletion stays upload-only, see deleteOrgDocument below. */
export async function renameOrgDocument(documentId: string, fileName: string): Promise<ActionResult> {
  await requireAdminUser();
  const trimmed = fileName.trim();
  if (!trimmed) return { ok: false, error: "File name can't be empty." };

  const supabase = await createCrmServerClient();
  const { error } = await supabase
    .from("crm_documents")
    .update({ file_name: trimmed })
    .eq("id", documentId)
    .in("kind", RENAMEABLE_KINDS);

  if (error) return { ok: false, error: "Could not rename the file. Please try again." };

  revalidateDocuments();
  return { ok: true };
}

/** Soft-delete only, matching every other CRM document delete (e.g.
 * accounts/[id]/bol-actions.ts's deleteBolDocument) — the storage object
 * stays in place, the row just stops showing up. */
export async function deleteOrgDocument(documentId: string): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("kind", ORG_UPLOAD_KIND);

  if (error) return { ok: false, error: "Could not delete the file. Please try again." };

  revalidateDocuments();
  return { ok: true };
}
