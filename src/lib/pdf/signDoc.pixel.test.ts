import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { signExistingPdf, signImageAsPdf } from "./signDoc";
import { renderPdfFirstPageToPng } from "./pdfPageThumbnail";
import { PDFDocument } from "pdf-lib";

/**
 * Pixel-level verification of the BOL signature compositing math
 * (retirement-readiness Objective 4 — the Phase 6 decoupling report
 * documented a gap: "structural verification passing" (signDoc.test.ts:
 * page count, file size) but no rasterized visual check of placement,
 * size, or rotation, because no PDF rasterizer was known-available in
 * that session.
 *
 * A rasterizer IS available in this environment —
 * src/lib/pdf/pdfPageThumbnail.ts's renderPdfFirstPageToPng(), already
 * shipping in production for CRM document thumbnails (@napi-rs/canvas +
 * pdfjs-dist's Node build, no new dependency installed for this test).
 * This suite reuses it exactly as-is to rasterize signDoc.ts's own
 * compositing output and inspect the resulting pixels — closing the
 * gap without installing anything new, per the instruction not to add
 * native deps just to force this through.
 */

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const RASTER_TARGET_WIDTH = 500; // must match pdfPageThumbnail.ts's TARGET_WIDTH_PX

/** A fully-opaque solid-color PNG standing in for a drawn signature. */
async function solidPng(width: number, height: number, rgb: [number, number, number]): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: rgb[0], g: rgb[1], b: rgb[2], alpha: 1 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

/** Left half red, right half blue — lets a test detect orientation after rotation. */
async function splitColorPng(width: number, height: number): Promise<Uint8Array> {
  const half = Math.floor(width / 2);
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: width - half, height, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
        })
          .png()
          .toBuffer(),
        left: half,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

async function blankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([PAGE_W, PAGE_H]);
  return pdf.save();
}

/** PDF point (bottom-left origin, y-up) → raster pixel (top-left origin, y-down)
 *  at the same scale renderPdfFirstPageToPng uses (RASTER_TARGET_WIDTH / PAGE_W). */
function pdfPointToRasterPixel(x: number, y: number): { px: number; py: number } {
  const scale = RASTER_TARGET_WIDTH / PAGE_W;
  return { px: Math.round(x * scale), py: Math.round((PAGE_H - y) * scale) };
}

async function pixelAt(png: Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
}

function isClose(a: number, b: number, tol = 40): boolean {
  return Math.abs(a - b) <= tol;
}

describe("signDoc pixel-level verification (rasterized)", () => {
  it("places an unrotated stamp at the expected pixel location, at the expected size, and leaves the rest of the page blank", async () => {
    const src = await blankPdf();
    const stampW = 240;
    const stampH = 90;
    const cx = 300;
    const cy = 500;
    const png = await solidPng(stampW, stampH, [200, 30, 30]);

    const out = await signExistingPdf(
      src,
      0,
      { cx, cy, rotationDeg: 0, widthPts: stampW },
      { pngBytes: png, aspect: stampH / stampW },
    );

    const rendered = await renderPdfFirstPageToPng(out);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    // Page dimensions: rasterized at a fixed target width, height follows
    // the page's own aspect ratio.
    const meta = await sharp(rendered.png).metadata();
    expect(meta.width).toBe(RASTER_TARGET_WIDTH);
    // pdfPageThumbnail.ts's canvas uses Math.ceil, not Math.round, for height.
    expect(meta.height).toBe(Math.ceil((PAGE_H / PAGE_W) * RASTER_TARGET_WIDTH));

    // Center of the stamp should be the stamp's color.
    const center = pdfPointToRasterPixel(cx, cy);
    const centerPx = await pixelAt(rendered.png, center.px, center.py);
    expect(isClose(centerPx.r, 200)).toBe(true);
    expect(isClose(centerPx.g, 30)).toBe(true);
    expect(isClose(centerPx.b, 30)).toBe(true);
    expect(centerPx.a).toBeGreaterThan(200);

    // A point well outside the stamp's bounding box should be blank (white,
    // fully opaque page background — pdf-lib pages render white by default).
    const farPx = await pixelAt(rendered.png, 20, 20);
    expect(farPx.r).toBeGreaterThan(240);
    expect(farPx.g).toBeGreaterThan(240);
    expect(farPx.b).toBeGreaterThan(240);

    // Size: walk outward from the center along X at the stamp's vertical
    // midline until color stops matching, and confirm the measured half-width
    // in raster pixels is close to the expected half-width (stampW/2 * scale).
    const scale = RASTER_TARGET_WIDTH / PAGE_W;
    const expectedHalfWidthPx = (stampW / 2) * scale;
    let measuredHalfWidthPx = 0;
    for (let dx = 0; dx < expectedHalfWidthPx + 15; dx++) {
      const p = await pixelAt(rendered.png, center.px + dx, center.py);
      if (isClose(p.r, 200) && isClose(p.g, 30) && isClose(p.b, 30)) {
        measuredHalfWidthPx = dx;
      } else if (dx > 3) {
        break;
      }
    }
    expect(Math.abs(measuredHalfWidthPx - expectedHalfWidthPx)).toBeLessThan(6);
  });

  it("rotates the stamp so the left/right color split swaps sides as expected at 180deg", async () => {
    const src = await blankPdf();
    const stampW = 200;
    const stampH = 80;
    const cx = 300;
    const cy = 500;
    const png = await splitColorPng(stampW, stampH);

    // Unrotated: red should be on the LEFT (smaller x), blue on the RIGHT.
    const outFlat = await signExistingPdf(
      src,
      0,
      { cx, cy, rotationDeg: 0, widthPts: stampW },
      { pngBytes: png, aspect: stampH / stampW },
    );
    const renderedFlat = await renderPdfFirstPageToPng(outFlat);
    expect(renderedFlat.ok).toBe(true);
    if (!renderedFlat.ok) return;
    const scale = RASTER_TARGET_WIDTH / PAGE_W;
    const quarterWidthPx = Math.round((stampW / 4) * scale);
    const centerFlat = pdfPointToRasterPixel(cx, cy);
    const leftFlat = await pixelAt(renderedFlat.png, centerFlat.px - quarterWidthPx, centerFlat.py);
    const rightFlat = await pixelAt(renderedFlat.png, centerFlat.px + quarterWidthPx, centerFlat.py);
    expect(leftFlat.r).toBeGreaterThan(leftFlat.b); // left = red-dominant
    expect(rightFlat.b).toBeGreaterThan(rightFlat.r); // right = blue-dominant

    // Rotated 180deg: the same local-frame "left" half should now render on
    // the RIGHT side of the stamp's footprint (rotation is about the stamp's
    // own center, per signDoc.ts's rotOffset math).
    const outRot = await signExistingPdf(
      src,
      0,
      { cx, cy, rotationDeg: 180, widthPts: stampW },
      { pngBytes: png, aspect: stampH / stampW },
    );
    const renderedRot = await renderPdfFirstPageToPng(outRot);
    expect(renderedRot.ok).toBe(true);
    if (!renderedRot.ok) return;
    const centerRot = pdfPointToRasterPixel(cx, cy);
    const leftRot = await pixelAt(renderedRot.png, centerRot.px - quarterWidthPx, centerRot.py);
    const rightRot = await pixelAt(renderedRot.png, centerRot.px + quarterWidthPx, centerRot.py);
    expect(rightRot.r).toBeGreaterThan(rightRot.b); // red flipped to the right
    expect(leftRot.b).toBeGreaterThan(leftRot.r); // blue flipped to the left
  });

  it("sizes an image-backed BOL page to the source image's exact pixel dimensions and places the stamp correctly on it", async () => {
    const imgW = 1000;
    const imgH = 700;
    const bg = await sharp({ create: { width: imgW, height: imgH, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .jpeg()
      .toBuffer();
    const stampW = 240;
    const stampH = 90;
    const cx = 500;
    const cy = 350;
    const sigPng = await solidPng(stampW, stampH, [20, 120, 40]);

    const out = await signImageAsPdf(
      new Uint8Array(bg),
      imgW,
      imgH,
      { cx, cy, rotationDeg: 0, widthPts: stampW },
      { pngBytes: sigPng, aspect: stampH / stampW },
    );

    const doc = await PDFDocument.load(out);
    const page = doc.getPage(0);
    expect(Math.round(page.getWidth())).toBe(imgW);
    expect(Math.round(page.getHeight())).toBe(imgH);

    const rendered = await renderPdfFirstPageToPng(out);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    // Image-backed pages are 1pt-per-source-pixel, so the raster scale here
    // is RASTER_TARGET_WIDTH / imgW, not / PAGE_W.
    const scale = RASTER_TARGET_WIDTH / imgW;
    const px = Math.round(cx * scale);
    const py = Math.round((imgH - cy) * scale);
    const centerPx = await pixelAt(rendered.png, px, py);
    expect(isClose(centerPx.r, 20)).toBe(true);
    expect(isClose(centerPx.g, 120)).toBe(true);
    expect(isClose(centerPx.b, 40)).toBe(true);
  });
});
