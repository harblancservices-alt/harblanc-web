// listPublicOrgDocuments() is the SALES-AGENT read of the same library the
// owner-only Admin Documents grid lists — one query module, not a second
// copy — narrowed to `is_public = true`. Admins see every document at
// /crm/admin/documents and decide, per document, which ones reach this
// screen; a fresh upload defaults to private (the column default) and stays
// invisible here until someone flips its toggle.
//
// A separate named function rather than a `publicOnly` flag on
// listOrgUploads(), so the agent-facing path can't be reached by forgetting
// an argument. Writing the library (upload/rename/delete/publish) stays in
// ../../admin/documents/actions.ts, where every action re-verifies
// role==='owner' itself.
import { listPublicOrgDocuments } from "../../admin/documents-data";
import { DocumentLibrary, type LibraryDocument } from "./DocumentLibrary";

export const dynamic = "force-dynamic";

/**
 * Operations → Documents — the sales agent's view of the org document
 * library, and the folder compiler.
 *
 * ONE record and ONE stored file per document, org-wide. This page creates
 * nothing: no second table, no second bucket, no duplicate row, no saved
 * folder. It reads the very crm_documents rows the Admin grid manages and
 * hands them to a client grid that mirrors that grid's layout — same
 * documents, two permission levels.
 *
 * Compiling a folder is equally stateless: the client posts document IDs to
 * ./packet/route.ts, which streams a zip back and writes nothing anywhere
 * (Brent's explicit call — the packet is ephemeral, the download IS the
 * deliverable). So this page stays a pure read.
 *
 * Everything crossing into DocumentLibrary (a client component) is a plain
 * serializable value. `storagePath` is included: the rep's per-document
 * "open" and "download" mint a short-lived signed URL from it, exactly the
 * way the Admin grid does. It is NOT what the compile route trusts — that
 * takes IDs only and re-resolves each path server-side, org-scoped and
 * is_public-checked.
 *
 * `thumbUrl`/`previewUrl` are the short-lived signed URLs
 * listPublicOrgDocuments() already produces for the Admin grid; passing them
 * straight through is what makes a card here identical to its card there,
 * off the one preview mechanism (_shell/DocThumb.tsx) rather than a second.
 */
export default async function OperationsDocumentsPage() {
  const published = await listPublicOrgDocuments();

  const documents: LibraryDocument[] = published.map((d) => ({
    id: d.id,
    fileName: d.fileName,
    storagePath: d.storagePath,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
    thumbUrl: d.thumbUrl,
    previewUrl: d.previewUrl,
  }));

  return <DocumentLibrary documents={documents} />;
}
