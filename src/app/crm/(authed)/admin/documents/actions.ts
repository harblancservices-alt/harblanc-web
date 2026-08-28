"use server";

import { revalidatePath } from "next/cache";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { ORG_UPLOAD_KIND, PUBLISHABLE_KINDS, STORAGE_BUCKET, THUMB_SUFFIX } from "../documents-data";

/** The document kinds THIS TAB manages: admin uploads plus the two blank
 * master templates. Titles are editable for both, and both can be published
 * or hidden. Deletion stays upload-only (see deleteOrgDocument below).
 *
 * Every write below scopes to this list, so a document id belonging to a
 * COMPANY (a customer BOL, a commodity photo, a generated rate con) matches
 * nothing and is left untouched no matter what id is posted.
 *
 * Imported from ../documents-data rather than redeclared here: the writer
 * (setDocumentPublic) and the readers (listPublicOrgDocuments, the packet
 * route) have to agree on this list exactly, and they didn't while it was a
 * private const — publishing a template wrote a flag nothing read. */
const TAB_MANAGED_KINDS = PUBLISHABLE_KINDS;
import type { ActionResult, AdminBlankTemplateType } from "../types";
import { getBrokerProfile } from "../../_shell/brokerProfile";
import { renderPdfFirstPageToPng } from "@/lib/pdf/pdfPageThumbnail";
import {
  BLANK_TEMPLATE_FILE_NAME,
  BLANK_TEMPLATE_SLUG,
  buildBlankTemplateBuffer,
} from "./blankTemplates";

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
    .in("kind", TAB_MANAGED_KINDS);

  if (error) return { ok: false, error: "Could not rename the file. Please try again." };

  revalidateDocuments();
  return { ok: true };
}

/**
 * Publishes / unpublishes ONE document — the slide toggle on each card in the
 * Admin Documents grid. `is_public = true` is the only thing that puts a
 * document in front of a sales agent in Operations → Documents.
 *
 * Owner-only, enforced HERE and not merely in the UI: requireAdminUser()
 * re-checks role==='owner' on every call, exactly like renameOrgDocument and
 * deleteOrgDocument above. That check is the real gate — crm_documents' RLS
 * policy is a plain org match (`org_id = crm_current_org()`, for all
 * operations), so RLS alone would let any member of the org update the
 * column. This is the same posture every other write on this tab already
 * has; it is not a new gap introduced by publishing.
 *
 * Scoped to the kinds this tab actually manages (uploads + the two blank
 * master templates, via TAB_MANAGED_KINDS). A document id belonging to a
 * COMPANY — a customer's BOL, a commodity photo, a generated rate con —
 * simply matches nothing and is left alone, so this action can never be
 * repurposed to publish per-account paperwork into the shared library.
 *
 * Revalidates BOTH surfaces: the admin grid it was flipped from, and the
 * Operations list whose contents just changed.
 */
export async function setDocumentPublic(
  documentId: string,
  isPublic: boolean,
): Promise<ActionResult> {
  await requireAdminUser();
  const supabase = await createCrmServerClient();

  const { error } = await supabase
    .from("crm_documents")
    .update({ is_public: isPublic })
    .eq("id", documentId)
    .in("kind", TAB_MANAGED_KINDS)
    .is("account_id", null)
    .is("deal_id", null)
    .is("deleted_at", null);

  if (error) {
    return {
      ok: false,
      error: isPublic
        ? "Could not publish the document. Please try again."
        : "Could not hide the document. Please try again.",
    };
  }

  revalidateDocuments();
  revalidatePath("/crm/operations/documents");
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

/**
 * REGENERATE A BLANK MASTER TEMPLATE from the current PDF components.
 *
 * The reason this exists: these two cards were rendered once, in Aug 2026,
 * by a helper that was then deleted. When the BOL's Third Party Bill To box
 * was fixed and its "N/A" placeholder removed, every newly generated BOL
 * picked the changes up and the master on file did not — it sat eleven days
 * out of date with nobody able to rebuild it. A template library that
 * cannot be rebuilt is a template library that drifts.
 *
 * IT OVERWRITES, IT DOES NOT ADD. The bytes go to the row's EXISTING
 * storage_path (upsert), so the same crm_documents row keeps pointing at
 * the same object and the tab still shows two template cards, not four.
 * `is_public` is never touched — these stay private unless somebody
 * deliberately publishes them.
 *
 * The `.thumb.v3.png` sibling is rewritten too. Skipping it would leave the
 * card showing the OLD page while the file behind it was new, which is
 * exactly the kind of silent disagreement this action exists to end.
 */
export async function regenerateBlankTemplate(
  docType: AdminBlankTemplateType,
): Promise<ActionResult> {
  const user = await requireAdminUser();
  const supabase = await createCrmServerClient();

  const kind = docType === "bill_of_lading" ? "org_doc:Bill of Lading" : "org_doc:Rate Confirmation";

  const { data: existing } = await supabase
    .from("crm_documents")
    .select("id, storage_path")
    .eq("kind", kind)
    .is("account_id", null)
    .is("deal_id", null)
    .is("deleted_at", null)
    .maybeSingle();

  let buffer: Buffer;
  try {
    const broker = await getBrokerProfile();
    buffer = await buildBlankTemplateBuffer(docType, broker);
  } catch {
    return { ok: false, error: "Could not render the template. Please try again." };
  }

  const fileName = BLANK_TEMPLATE_FILE_NAME[docType];
  // Reuse the existing object's path so the row still resolves; only a slot
  // that has never had a file gets a new one.
  const storagePath =
    (existing?.storage_path as string | undefined) ??
    `${user.orgId}/org-docs/${BLANK_TEMPLATE_SLUG[docType]}/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return { ok: false, error: "Could not save the regenerated template. Please try again." };
  }

  // Best-effort preview, same as the original generator: a failure here
  // leaves a stale thumbnail but must not fail the regeneration itself.
  const thumb = await renderPdfFirstPageToPng(buffer);
  if (thumb.ok) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(`${storagePath}${THUMB_SUFFIX}`, thumb.png, {
        contentType: "image/png",
        upsert: true,
      });
  }

  if (existing) {
    const { error } = await supabase
      .from("crm_documents")
      .update({ size_bytes: buffer.byteLength, updated_at: new Date().toISOString() })
      .eq("id", existing.id as string);
    if (error) return { ok: false, error: "Template rebuilt, but the document record did not update." };
  } else {
    const { error } = await supabase.from("crm_documents").insert({
      org_id: user.orgId,
      user_id: user.id,
      kind,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: buffer.byteLength,
    });
    if (error) return { ok: false, error: "Template rebuilt, but the document record did not save." };
  }

  revalidateDocuments();
  return { ok: true };
}
