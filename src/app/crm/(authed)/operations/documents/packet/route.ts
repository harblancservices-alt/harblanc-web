import { NextResponse } from "next/server";
import { requireCrmUser, createCrmServerClient } from "@/lib/crm/auth";
import { ORG_UPLOAD_KIND } from "../../../admin/documents-data";
import {
  MAX_PACKET_BYTES,
  MAX_PACKET_DOCUMENTS,
  MAX_PACKET_NAME_LENGTH,
  PACKET_FILENAME_HEADER,
  dedupeEntryName,
  safePacketFileName,
} from "../packetContract";

/**
 * POST /crm/operations/documents/packet
 *
 * Body: { name: string, ids: string[] }
 * Response: a .zip of the selected org document templates, each kept as its
 * OWN separate file inside the archive under its original name (never merged
 * into a single document), streamed back as an attachment.
 *
 * Ephemeral by design: nothing is written to crm_documents, nothing is
 * uploaded to Storage, no packet row exists. The response body is the entire
 * product — which is also why this is a route handler rather than a Server
 * Action (a Server Action can't stream a binary attachment back).
 *
 * AUTHORIZATION, three layers deep:
 *   1. src/middleware.ts's crmGate() already required a valid Supabase
 *      session for anything under /crm/** before this handler is reached.
 *   2. requireCrmUser() below re-confirms the session AND active
 *      crm_profiles membership — this handler is NOT covered by
 *      ../../layout.tsx (route handlers don't run through layouts), so it
 *      must do its own check rather than assume the section gate ran.
 *   3. IDs FROM THE CLIENT ARE NEVER TRUSTED. The lookup filters on the
 *      caller's own org_id and on kind=ORG_UPLOAD_KIND, on top of
 *      crm_documents' org-match RLS — so a tampered payload can neither
 *      reach another org's object nor smuggle out a company-scoped document
 *      (a customer's BOL, a commodity photo) through the template picker.
 *      Anything that doesn't come back from that query simply isn't included.
 *
 * There is no owner gate here on purpose: reading the template library is
 * open to every CRM user (that's what Operations is for). Only UPLOADING a
 * template is owner-only, and that lives in ../../../admin/documents.
 *
 * fflate is LAZY-imported inside the handler, per this repo's
 * module-poisoning convention (same as the tms-v2 camera PDF export and
 * src/lib/domain/bol-signing.ts): a load-time throw in the zip library must
 * never poison this module's export or 500 the route at import time.
 *
 * WHY fflate AND NOT src/lib/camera/zip.ts's makeZip(): that hand-rolled
 * writer already exists and works, but it is STORE-only and, by its own
 * header comment, assumes ASCII entry names ("BOL-001.jpg …") and therefore
 * sets no UTF-8 filename flag. These entry names are admin-typed document
 * titles — an em dash, an accent, a curly quote is entirely normal — and
 * would come out mojibake. It's also service-role/camera-namespaced.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRM_DOCUMENTS_BUCKET = "crm-documents";

type PacketRequest = { name?: unknown; ids?: unknown };

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const user = await requireCrmUser();

  let body: PacketRequest;
  try {
    body = (await request.json()) as PacketRequest;
  } catch {
    return bad("Could not read the request.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return bad("Give the packet a name before downloading it.");
  if (name.length > MAX_PACKET_NAME_LENGTH) {
    return bad(`Packet names are limited to ${MAX_PACKET_NAME_LENGTH} characters.`);
  }

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  if (ids.length === 0) return bad("Select at least one document to include.");
  if (ids.length > MAX_PACKET_DOCUMENTS) {
    return bad(`A packet can hold up to ${MAX_PACKET_DOCUMENTS} documents.`);
  }

  const supabase = await createCrmServerClient();

  // Layer 3: re-resolve every id against the caller's own org, restricted to
  // the org-upload kind AND to documents an admin has actually published.
  // Storage paths come from HERE, never from the client.
  //
  // `is_public` is re-checked on this side on purpose. The Operations list
  // already only renders published documents, but a filtered LIST is a
  // presentation choice — this is the download itself. Without the predicate
  // here, an unpublished document's id (from a stale page, a copied request,
  // or a hand-rolled POST) would still come back in a zip, which would make
  // "hidden" mean "unlisted" rather than "unreachable".
  const { data: rows, error: lookupError } = await supabase
    .from("crm_documents")
    .select("id, file_name, storage_path, size_bytes")
    .in("id", ids)
    .eq("org_id", user.orgId)
    .eq("kind", ORG_UPLOAD_KIND)
    .eq("is_public", true)
    .is("account_id", null)
    .is("deal_id", null)
    .is("deleted_at", null);

  if (lookupError) return bad("Could not load the selected documents.", 500);

  const documents = (rows ?? []) as {
    id: string;
    file_name: string;
    storage_path: string;
    size_bytes: number | null;
  }[];
  if (documents.length === 0) {
    return bad("None of the selected documents are available any more. Refresh and try again.");
  }

  const declaredBytes = documents.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);
  if (declaredBytes > MAX_PACKET_BYTES) {
    return bad(
      `That selection is too large to bundle (limit ${Math.round(MAX_PACKET_BYTES / (1024 * 1024))} MB). Pick fewer documents.`,
    );
  }

  // Keep the client's selection ORDER (the lookup comes back in whatever
  // order Postgres chose), so the zip reads the way the rep built it.
  const byId = new Map(documents.map((d) => [d.id, d]));
  const ordered = ids.map((id) => byId.get(id)).filter((d): d is (typeof documents)[number] => Boolean(d));

  const files: Record<string, Uint8Array> = {};
  const takenNames = new Set<string>();
  let totalBytes = 0;

  for (const doc of ordered) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(CRM_DOCUMENTS_BUCKET)
      .download(doc.storage_path);
    if (downloadError || !blob) {
      // One unreadable object must not sink the whole packet — skip it and
      // carry on, same tolerance as the camera export's per-image skip.
      console.error("[operations packet] download failed:", doc.storage_path, downloadError);
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_PACKET_BYTES) {
      return bad(
        `That selection is too large to bundle (limit ${Math.round(MAX_PACKET_BYTES / (1024 * 1024))} MB). Pick fewer documents.`,
      );
    }
    files[dedupeEntryName(doc.file_name, takenNames)] = bytes;
  }

  const includedCount = Object.keys(files).length;
  if (includedCount === 0) {
    return bad("Could not read any of the selected documents. Please try again.", 500);
  }

  let archive: Uint8Array;
  try {
    const { zipSync } = await import("fflate");
    archive = zipSync(files);
  } catch (e) {
    console.error("[operations packet] zip assembly failed:", e);
    return bad("Could not build the packet. Please try again.", 500);
  }

  const fileName = `${safePacketFileName(name)}.zip`;

  return new Response(archive as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(archive.byteLength),
      [PACKET_FILENAME_HEADER]: fileName,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
