import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { loadBatchForExport, safeFilename } from "@/lib/camera/export";
import { makeZip } from "@/lib/camera/zip";

/**
 * Image-ZIP download for a camera batch — /tms-v2's copy of admin's
 * camera-export-zip route (retirement-readiness Objective 2).
 *
 *   GET /tms-v2/camera/<batchId>/export/zip
 *
 * Bundles the batch's JPEGs (STORE method — already-compressed, no gain from
 * DEFLATE) named BOL-001.jpg, BOL-002.jpg, … in order. Streams back as
 * application/zip with an attachment Content-Disposition.
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  await adminFromMiddleware();
  const { batchId } = await context.params;

  const data = await loadBatchForExport(batchId);
  if (!data) {
    return NextResponse.json({ error: "Batch not found." }, { status: 404 });
  }
  if (data.images.length === 0) {
    return NextResponse.json(
      { error: "This batch has no photos to export." },
      { status: 400 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = makeZip(
      data.images.map((img) => ({ name: img.name, data: img.bytes })),
    );
  } catch (e) {
    console.error("[camera zip] assembly failed:", e);
    return NextResponse.json(
      { error: "Could not build the ZIP." },
      { status: 500 },
    );
  }

  const filename = `${safeFilename(data.batchName)}.zip`;
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
