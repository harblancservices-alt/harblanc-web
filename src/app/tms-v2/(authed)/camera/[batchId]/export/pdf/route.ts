import { NextResponse } from "next/server";
import { adminFromMiddleware } from "@/lib/auth/session";
import { loadBatchForExport, safeFilename } from "@/lib/camera/export";

/**
 * Combined-PDF download for a camera batch — /tms-v2's copy of admin's
 * camera-export-pdf route (retirement-readiness Objective 2 — found via
 * dependency sweep: CameraCapture.tsx was navigating the whole tab to
 * admin's export route).
 *
 *   GET /tms-v2/camera/<batchId>/export/pdf
 *
 * One page per photo, in batch order, each sized to the image's aspect (long
 * edge capped so pages read like a normal document scan). Streams back as
 * application/pdf with an attachment Content-Disposition so the browser saves
 * it to the device.
 *
 * pdf-lib is LAZY-imported inside the handler, per this repo's module-poisoning
 * convention: a load-time throw must never poison this module's export / 500
 * the route at import.
 */

// Long-edge cap in PDF points (~Letter height) so a page isn't absurdly large.
const MAX_PT = 792;

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

  let buffer: Uint8Array;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    for (const img of data.images) {
      // All camera shots are JPEG. Skip anything that fails to embed rather
      // than failing the whole export.
      let embedded;
      try {
        embedded = await pdf.embedJpg(img.bytes);
      } catch (e) {
        console.error("[camera pdf] embed failed:", img.name, e);
        continue;
      }
      const iw = embedded.width;
      const ih = embedded.height;
      const scale = Math.min(1, MAX_PT / Math.max(iw, ih));
      const pw = Math.max(1, iw * scale);
      const ph = Math.max(1, ih * scale);
      const page = pdf.addPage([pw, ph]);
      page.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
    }
    if (pdf.getPageCount() === 0) {
      return NextResponse.json(
        { error: "Could not assemble any pages." },
        { status: 500 },
      );
    }
    buffer = await pdf.save();
  } catch (e) {
    console.error("[camera pdf] assembly failed:", e);
    return NextResponse.json(
      { error: "Could not build the PDF." },
      { status: 500 },
    );
  }

  const filename = `${safeFilename(data.batchName)}.pdf`;
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
