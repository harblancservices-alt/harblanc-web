import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadDocName, normalizeLoadDocKind, withExt } from "@/lib/admin/doc-name";

/**
 * Load documents (rate con / BOL / POD / other) — upload-URL minting, the
 * canonical-named metadata row insert, and delete. Shared by both /admin
 * and /tms-v2, each of which adds only its own app-specific behavior on top
 * (demo-mode gate and revalidatePath targets for /admin; revalidatePath
 * targets for /tms-v2, which has no demo mode) — see the two wrapper
 * files: src/app/admin/(authed)/dispatch/loads/actions.ts and
 * src/actions/tms-v2/documents.ts.
 *
 * Deliberately EXCLUDES BOL signature compositing (signBolRole /
 * regenerateSignedBol and everything under admin's "── BOL signatures ──"
 * section) — that stays in admin's dispatch/loads/actions.ts unchanged, a
 * separate, later decoupling phase. DOC_BUCKET and sanitizeFilename are
 * exported from here because admin's signBolRole also needs the identical
 * bucket name and filename-sanitizing rule for the signed-output file it
 * writes to the same bucket/load folder — importing them from here (a
 * plain, safe import) keeps that one bucket name and one sanitizing rule
 * truly singular rather than reintroducing a second copy in admin's file.
 *
 * Bucket name and path convention are UNCHANGED from before this
 * extraction: bucket "load-documents", path "{loadId}/{12-char-prefix}-
 * {sanitized-filename}". Existing uploaded documents are unaffected —
 * this extraction only relocates the code that reads/writes them, not the
 * convention itself.
 *
 * No company/user scoping or per-caller authorization here by design —
 * this is a single-tenant domain (no org column on load_documents), and
 * every caller is already behind the shared admin session gate
 * (src/middleware.ts) before it can reach a Server Action that calls these.
 */

export const DOC_BUCKET = "load-documents";
const DOC_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const DOC_MAX_BYTES = 15 * 1024 * 1024;
const DOC_KINDS = new Set(["rate_con", "bol", "pod", "other"]);

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  return (
    trimmed
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "upload"
  );
}

export type DocUploadResult = { ok: true } | { ok: false; reason: string };

export type CreateUploadUrlResult =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; reason: string };

export type RecordDoc = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Step 1 of a direct-to-storage upload: validate the file's type/size and mint
 * a signed upload URL token for a fresh path in the load-documents bucket. The
 * client then uploads the bytes straight to storage (bypassing the server
 * action / Vercel body limits). No file bytes pass through this action.
 */
export async function createLoadDocUploadUrl(
  loadId: string,
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<CreateUploadUrlResult> {
  try {
    if (!DOC_MIME.has(mimeType)) {
      return {
        ok: false,
        reason: `Unsupported type ${mimeType || "unknown"} ("${fileName}"). Use JPG, PNG, WEBP, or PDF.`,
      };
    }
    if (sizeBytes > DOC_MAX_BYTES) {
      return {
        ok: false,
        reason: `"${fileName}" is too large (${Math.round(sizeBytes / 1024 / 1024)} MB). Max 15 MB.`,
      };
    }
    const safe = sanitizeFilename(fileName);
    const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const path = `${loadId}/${prefix}-${safe}`;
    const sb = createServiceRoleClient();
    const { data, error } = await sb.storage
      .from(DOC_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return {
        ok: false,
        reason: `Could not start upload: ${error?.message ?? "unknown error"}`,
      };
    }
    return { ok: true, bucket: DOC_BUCKET, path: data.path, token: data.token };
  } catch (e) {
    console.error("[createLoadDocUploadUrl] failed:", e);
    return {
      ok: false,
      reason: `Could not start upload: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}

/**
 * Step 2 of a direct-to-storage upload: insert the load_documents row(s) for
 * files the client already uploaded to storage. Tiny JSON payload — no bytes.
 * thumb_path is null (thumbnails are no longer generated in the request path).
 */
export async function recordLoadDocuments(
  loadId: string,
  kindRaw: string,
  docs: RecordDoc[],
): Promise<DocUploadResult> {
  try {
    if (!Array.isArray(docs) || docs.length === 0) {
      return { ok: false, reason: "No documents to save." };
    }
    const kind = DOC_KINDS.has(kindRaw) ? kindRaw : "other";
    for (const d of docs) {
      if (!DOC_MIME.has(d.mimeType)) {
        return {
          ok: false,
          reason: `Unsupported type ${d.mimeType || "unknown"} ("${d.originalFilename}").`,
        };
      }
      if (d.sizeBytes > DOC_MAX_BYTES) {
        return {
          ok: false,
          reason: `"${d.originalFilename}" is too large. Max 15 MB.`,
        };
      }
    }
    const sb = createServiceRoleClient();

    // Canonical stored file_name: "RC / BOL / POD - <load#> - <broker>", with a
    // 1-based upload-order number when siblings exist. Look up the load's number
    // + broker, and how many same-type (non-signed) docs already exist, so the
    // batch continues the numbering. (Display recomputes authoritatively.)
    const { data: loadRow } = await sb
      .from("loads")
      .select("load_number, broker_name")
      .eq("id", loadId)
      .maybeSingle<{ load_number: string | null; broker_name: string | null }>();
    const { data: existingRows } = await sb
      .from("load_documents")
      .select("id")
      .eq("load_id", loadId)
      .eq("kind", kind)
      .is("signed_from_doc_id", null)
      .returns<{ id: string }[]>();
    const existing = existingRows?.length ?? 0;
    const total = existing + docs.length;
    const docKind = normalizeLoadDocKind(kind);

    const rows = docs.map((d, i) => ({
      load_id: loadId,
      kind,
      storage_path: d.storagePath,
      thumb_path: null,
      original_filename: withExt(
        loadDocName({
          kind: docKind,
          loadNumber: loadRow?.load_number,
          broker: loadRow?.broker_name,
          index: existing + i + 1,
          total,
        }),
        d.originalFilename,
      ),
      mime_type: d.mimeType,
      size_bytes: d.sizeBytes,
    }));
    const { error } = await sb.from("load_documents").insert(rows);
    if (error) {
      // Remove the just-uploaded orphans so a failed insert leaves no junk.
      await sb.storage.from(DOC_BUCKET).remove(docs.map((d) => d.storagePath));
      return { ok: false, reason: `Save failed: ${error.message}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[recordLoadDocuments] failed:", e);
    return {
      ok: false,
      reason: `Could not save document: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}

export async function deleteLoadDocument(
  docId: string,
  loadId: string,
): Promise<DocUploadResult> {
  try {
    const sb = createServiceRoleClient();
    const { data: row } = await sb
      .from("load_documents")
      .select("id, storage_path")
      .eq("id", docId)
      .eq("load_id", loadId)
      .maybeSingle<{ id: string; storage_path: string }>();
    if (!row) return { ok: false, reason: "Document not found." };
    const { error: storageError } = await sb.storage.from(DOC_BUCKET).remove([row.storage_path]);
    if (storageError) return { ok: false, reason: `Could not delete file: ${storageError.message}` };
    const { error: dbError } = await sb.from("load_documents").delete().eq("id", row.id);
    if (dbError) return { ok: false, reason: `Could not delete document: ${dbError.message}` };
    return { ok: true };
  } catch (e) {
    console.error("[deleteLoadDocument] failed:", e);
    return {
      ok: false,
      reason: `Could not delete document: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}
