import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadDocName, withExt } from "@/lib/admin/doc-name";
import { DOC_BUCKET, sanitizeFilename, type DocUploadResult } from "@/lib/domain/load-documents";
import type { SignatureStamp } from "@/lib/pdf/signDoc";

/**
 * BOL signature compositing (Receiver + Carrier) — shared by both /admin and
 * /tms-v2, each of which adds only its own app-specific behavior on top
 * (demo-mode gate and revalidatePath targets for /admin; revalidatePath
 * targets for /tms-v2, which has no demo mode) — see the two wrapper files:
 * src/app/admin/(authed)/dispatch/loads/actions.ts and
 * src/actions/tms-v2/documents.ts. DOC_BUCKET/sanitizeFilename/
 * DocUploadResult come from @/lib/domain/load-documents (the Phase 4
 * extraction) rather than being redefined here — this module is signing/
 * compositing ONLY, storage primitives stay singular in that module.
 *
 * The original unsigned BOL is never touched. Each role's signature (a
 * trimmed transparent-PNG data URL) + its placement is stored in
 * bol_signatures keyed by (original doc, role). On every save this
 * REGENERATES the "— signed.pdf" output from the original + ALL current
 * role rows, so re-signing one role replaces only its row and re-stamps
 * both — the two signatures always coexist. EXISTING OVERWRITE BEHAVIOR,
 * preserved unchanged: the previous signed-output row(s) and their storage
 * objects are deleted after the new one is successfully inserted — this
 * was already the production behavior before this extraction, not a
 * change introduced by it.
 *
 * pdf-lib (via @/lib/pdf/signDoc) and sharp are loaded LAZILY inside
 * regenerateSignedBol — never at module top-level — so a pdf-lib/sharp eval
 * failure can't poison the "use server" action modules that import this
 * file (admin's dispatch/loads/actions.ts has many unrelated exported
 * actions in the same file; a top-level failure here would break all of
 * them). Same discipline as before this extraction — see the Save-ODO
 * regression this guards against (fixed in 8c74925).
 *
 * No company/user scoping or per-caller authorization here by design —
 * this is a single-tenant domain (no org column on these tables), and
 * every caller is already behind the shared admin session gate
 * (src/middleware.ts) before it can reach a Server Action that calls this.
 */

const BOL_ROLES = new Set(["receiver", "carrier"]);

/** Placement sent by the client — already mapped to the ORIGINAL's geometry. */
export type BolPlacement =
  | {
      kind: "pdf";
      pageIndex: number;
      cx: number;
      cy: number;
      rotationDeg: number;
      widthPts: number;
      aspect: number;
    }
  | { kind: "image"; fx: number; fy: number; widthFrac: number; aspect: number };

export type SignBolRolePayload = {
  pngDataUrl: string;
  printName: string;
  dateStr: string;
  placement: BolPlacement;
};

type StoredPlacement = BolPlacement & { printName?: string; dateStr?: string };
type SigRow = { role: string; png: string; placement: StoredPlacement };

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function stampFromRow(row: SigRow, cx: number, cy: number, widthPts: number, rotationDeg: number): SignatureStamp {
  const pl = row.placement;
  return {
    pageIndex: pl.kind === "pdf" ? pl.pageIndex : 0,
    place: { cx, cy, rotationDeg, widthPts },
    content: {
      pngBytes: dataUrlToBytes(row.png),
      aspect: pl.aspect,
      printName: pl.printName,
      dateStr: pl.dateStr,
    },
  };
}

async function regenerateSignedBol(
  origBytes: Uint8Array,
  origMime: string,
  sigs: SigRow[],
): Promise<Uint8Array> {
  // signDoc pulls in pdf-lib; load it LAZILY (never at module top-level) so a
  // pdf-lib eval failure is isolated to this function and can't poison the
  // "use server" modules that import this file — same rule as sharp below.
  const { signPdfWithStamps, signImageWithStamps } = await import(
    "@/lib/pdf/signDoc"
  );
  const isPdf = (origMime ?? "").includes("pdf");
  if (isPdf) {
    const stamps = sigs
      .filter((s) => s.placement.kind === "pdf")
      .map((s) => {
        const pl = s.placement as Extract<BolPlacement, { kind: "pdf" }>;
        return stampFromRow(s, pl.cx, pl.cy, pl.widthPts, pl.rotationDeg);
      });
    return signPdfWithStamps(origBytes, stamps);
  }
  // Image BOL: auto-orient (EXIF) + cap size, then map each role's fractions
  // onto the resulting pixel dimensions (resolution-independent).
  //
  // sharp is loaded LAZILY here (never at module top-level): its native binary
  // can throw at import time on Vercel, and a top-level import would poison
  // the "use server" module that imports this file — making EVERY action in
  // it (updateLoadOdometers, uploads, …) reject on invoke. That was the
  // Save-ODO regression fixed in 8c74925; keeping the import inside the one
  // function that needs it prevents it from ever coming back.
  const sharp = (await import("sharp")).default;
  const { data: jpgBuf, info } = await sharp(origBytes)
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const stamps = sigs
    .filter((s) => s.placement.kind === "image")
    .map((s) => {
      const pl = s.placement as Extract<BolPlacement, { kind: "image" }>;
      return stampFromRow(s, pl.fx * W, H - pl.fy * H, pl.widthFrac * W, 0);
    });
  return signImageWithStamps(new Uint8Array(jpgBuf), W, H, stamps);
}

/**
 * Save (or replace) one role's signature on a BOL and regenerate the signed
 * PDF from the original + all current role signatures. Keeps the original.
 * No revalidatePath / demo gate here by design — each app's wrapper (admin's
 * dispatch/loads/actions.ts, tms-v2's actions/tms-v2/documents.ts) adds
 * those on top after calling into this module.
 */
export async function signBolRole(
  loadId: string,
  originalDocId: string,
  role: string,
  payload: SignBolRolePayload,
): Promise<DocUploadResult> {
  try {
    if (!BOL_ROLES.has(role)) {
      return { ok: false, reason: "Unknown signer role." };
    }
    const sb = createServiceRoleClient();

    const { data: orig } = await sb
      .from("load_documents")
      .select("id, storage_path, original_filename, mime_type")
      .eq("id", originalDocId)
      .eq("load_id", loadId)
      .maybeSingle<{
        id: string;
        storage_path: string;
        original_filename: string;
        mime_type: string | null;
      }>();
    if (!orig) return { ok: false, reason: "Original BOL not found." };

    // 1. Upsert this role's signature (replaces the role's prior signature).
    const { error: upErr } = await sb.from("bol_signatures").upsert(
      {
        load_id: loadId,
        doc_id: originalDocId,
        role,
        png: payload.pngDataUrl,
        placement: {
          ...payload.placement,
          printName: payload.printName,
          dateStr: payload.dateStr,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "doc_id,role" },
    );
    if (upErr) return { ok: false, reason: `Could not save signature: ${upErr.message}` };

    // 2. Regenerate from the original + ALL current role signatures.
    const { data: sigRows } = await sb
      .from("bol_signatures")
      .select("role, png, placement")
      .eq("doc_id", originalDocId)
      .returns<SigRow[]>();
    const sigs = sigRows ?? [];

    const { data: blob, error: dlErr } = await sb.storage
      .from(DOC_BUCKET)
      .download(orig.storage_path);
    if (dlErr || !blob) {
      return { ok: false, reason: "Could not read the original BOL." };
    }
    const origBytes = new Uint8Array(await blob.arrayBuffer());
    const signedBytes = await regenerateSignedBol(origBytes, orig.mime_type ?? "", sigs);

    // 3. Upload the regenerated signed PDF (server → storage, no body limit).
    // Canonical stored name: "BOL - <load#> - <broker> - signed" (numbered when
    // this load has more than one signed BOL). Output is always a PDF.
    const { data: loadRow } = await sb
      .from("loads")
      .select("load_number, broker_name")
      .eq("id", loadId)
      .maybeSingle<{ load_number: string | null; broker_name: string | null }>();
    const { data: otherSigned } = await sb
      .from("load_documents")
      .select("id")
      .eq("load_id", loadId)
      .eq("kind", "bol")
      .not("signed_from_doc_id", "is", null)
      .neq("signed_from_doc_id", originalDocId)
      .returns<{ id: string }[]>();
    const signedSiblings = otherSigned?.length ?? 0;
    const fileName = withExt(
      loadDocName({
        kind: "bol",
        loadNumber: loadRow?.load_number,
        broker: loadRow?.broker_name,
        signed: true,
        index: signedSiblings + 1,
        total: signedSiblings + 1,
      }),
      ".pdf",
    );
    const prefix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const path = `${loadId}/${prefix}-${sanitizeFilename(fileName)}`;
    const { error: putErr } = await sb.storage
      .from(DOC_BUCKET)
      .upload(path, Buffer.from(signedBytes), { contentType: "application/pdf" });
    if (putErr) return { ok: false, reason: `Could not save signed BOL: ${putErr.message}` };

    // 4. Insert the new signed-output row, then drop the previous one(s).
    const { data: prev } = await sb
      .from("load_documents")
      .select("id, storage_path")
      .eq("signed_from_doc_id", originalDocId)
      .returns<{ id: string; storage_path: string }[]>();

    const { error: insErr } = await sb.from("load_documents").insert({
      load_id: loadId,
      kind: "bol",
      storage_path: path,
      thumb_path: null,
      original_filename: fileName.slice(0, 240),
      mime_type: "application/pdf",
      size_bytes: signedBytes.byteLength,
      signed_from_doc_id: originalDocId,
    });
    if (insErr) {
      await sb.storage.from(DOC_BUCKET).remove([path]);
      return { ok: false, reason: `Could not save signed BOL: ${insErr.message}` };
    }

    if (prev && prev.length > 0) {
      await sb.storage.from(DOC_BUCKET).remove(prev.map((p) => p.storage_path));
      await sb.from("load_documents").delete().in("id", prev.map((p) => p.id));
    }

    return { ok: true };
  } catch (e) {
    console.error("[signBolRole] failed:", e);
    return {
      ok: false,
      reason: `Could not sign BOL: ${e instanceof Error ? e.message : "unexpected error"}`,
    };
  }
}
