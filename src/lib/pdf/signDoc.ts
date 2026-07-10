import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
} from "pdf-lib";

/**
 * Composites a finger-drawn signature onto a BOL and returns a NEW PDF's bytes.
 *
 * Nothing here mutates the source document — the caller uploads the returned
 * bytes as a separate "<original> — signed.pdf" attachment, so the original
 * unsigned BOL is always preserved.
 *
 * Coordinate handling: the caller (which has the live pdf.js page + viewport)
 * converts the on-screen tap into a PDF user-space point via the viewport's own
 * `convertToPdfPoint`, so page rotation AND non-zero MediaBox/CropBox offsets
 * are already accounted for. We only need the page's /Rotate here to re-orient
 * the stamped signature+text so they read upright to someone viewing the
 * (rotated) page.
 */

export type SignaturePlacement = {
  /** Signature CENTER in PDF user-space points (bottom-left origin, y-up). */
  cx: number;
  cy: number;
  /** Page /Rotate in degrees: 0 | 90 | 180 | 270 (0 for image-backed pages). */
  rotationDeg: number;
  /** Signature width in points, measured along the page as the viewer sees it. */
  widthPts: number;
};

export type SignatureContent = {
  /** Transparent-background PNG bytes of the drawn signature. */
  pngBytes: Uint8Array;
  /** Signature aspect ratio = height / width. */
  aspect: number;
  printName?: string;
  dateStr?: string;
};

/** Rotate a local-frame offset (dx, dy) by `deg` degrees counter-clockwise. */
function rotOffset(dx: number, dy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [dx * c - dy * s, dx * s + dy * c];
}

async function stampSignature(
  pdf: PDFDocument,
  page: PDFPage,
  place: SignaturePlacement,
  content: SignatureContent,
): Promise<void> {
  const png = await pdf.embedPng(content.pngBytes);
  const w = place.widthPts;
  const h = w * content.aspect;

  // The viewer rotates the whole page /Rotate degrees clockwise; drawing the
  // stamp `a = /Rotate` degrees counter-clockwise in user space cancels that so
  // it reads upright. pdf-lib's `rotate` pivots the image about its (x,y)
  // lower-left corner, so solve for that corner such that the image CENTER lands
  // on (cx, cy):  corner = center − Rot(a)·(w/2, h/2).
  const a = ((place.rotationDeg % 360) + 360) % 360;
  const [ox, oy] = rotOffset(w / 2, h / 2, a);
  page.drawImage(png, {
    x: place.cx - ox,
    y: place.cy - oy,
    width: w,
    height: h,
    rotate: degrees(a),
  });

  const label = [content.printName?.trim(), content.dateStr?.trim()]
    .filter(Boolean)
    .join("    ");
  if (label) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const size = Math.max(8, Math.min(14, w * 0.09));
    const textW = font.widthOfTextAtSize(label, size);
    const gap = size * 0.9;
    // Baseline starts centered just below the signature (local frame), then the
    // same rotation is applied so the text tracks the signature's orientation.
    const [tx, ty] = rotOffset(-textW / 2, -h / 2 - gap, a);
    page.drawText(label, {
      x: place.cx + tx,
      y: place.cy + ty,
      size,
      font,
      color: rgb(0.06, 0.06, 0.09),
      rotate: degrees(a),
    });
  }
}

/** Embed the signature onto an existing PDF page. Returns the new PDF's bytes. */
export async function signExistingPdf(
  pdfBytes: Uint8Array,
  pageIndex: number,
  place: SignaturePlacement,
  content: SignatureContent,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdf.getPages();
  const idx = Math.max(0, Math.min(pageIndex, pages.length - 1));
  await stampSignature(pdf, pages[idx], place, content);
  return pdf.save();
}

/**
 * Build a one-page PDF from a JPEG-encoded image BOL and stamp the signature.
 * The page is 1pt-per-source-pixel, so `place.cx/cy` are just pixel coordinates
 * (from the top-left tap, converted to bottom-left origin by the caller) and
 * `rotationDeg` is 0.
 */
export async function signImageAsPdf(
  bgJpgBytes: Uint8Array,
  widthPx: number,
  heightPx: number,
  place: SignaturePlacement,
  content: SignatureContent,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([widthPx, heightPx]);
  const bg = await pdf.embedJpg(bgJpgBytes);
  page.drawImage(bg, { x: 0, y: 0, width: widthPx, height: heightPx });
  await stampSignature(pdf, page, place, content);
  return pdf.save();
}
