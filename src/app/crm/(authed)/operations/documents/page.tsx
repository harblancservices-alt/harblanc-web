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
import { PacketBuilder, type PacketTemplate } from "./PacketBuilder";

export const dynamic = "force-dynamic";

/**
 * Operations → Documents — the vendor-packet builder. A rep picks documents
 * out of the org's template library, names the packet, and downloads a zip
 * of those files.
 *
 * Nothing is persisted: there is no saved-packet table and no packet object
 * written back to Storage (Brent's explicit call — the packet is ephemeral,
 * the download IS the deliverable). This page is therefore a pure read, and
 * the whole write path is a single streaming route handler.
 *
 * Only plain, serializable values cross into PacketBuilder (a client
 * component). `storagePath` is deliberately dropped here — the client never
 * needs it and never sends it; it posts document IDs, and the route handler
 * resolves each ID's storage path itself, org-scoped, so a tampered payload
 * can't reach another org's object.
 *
 * `thumbUrl`/`previewUrl` are short-lived signed URLs listOrgUploads()
 * already produces for the Admin grid — passing them straight through is
 * what makes a row here look identical to its card there, off the one
 * preview mechanism (_shell/DocThumb.tsx) rather than a second one.
 */
export default async function OperationsDocumentsPage() {
  const uploads = await listPublicOrgDocuments();

  const templates: PacketTemplate[] = uploads.map((u) => ({
    id: u.id,
    fileName: u.fileName,
    mimeType: u.mimeType,
    sizeBytes: u.sizeBytes,
    createdAt: u.createdAt,
    thumbUrl: u.thumbUrl,
    previewUrl: u.previewUrl,
  }));

  return <PacketBuilder templates={templates} />;
}
