// listOrgUploads() is the SAME reader the owner-only Admin Documents grid
// uses (../../admin/documents/page.tsx) — one source of truth for "the org's
// uploaded document templates", not a second copy of that query. It carries
// no owner gate of its own, and it doesn't need one: crm_documents' RLS
// policy is org-match (`org_id = crm_current_org()`), so every CRM user in
// the org may READ the library. Only WRITING it (upload/rename/delete) is
// owner-only, and that stays in ../../admin/documents/actions.ts where each
// action re-verifies role==='owner' itself.
import { listOrgUploads } from "../../admin/documents-data";
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
  const uploads = await listOrgUploads();

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
