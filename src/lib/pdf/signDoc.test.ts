import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import sharp from "sharp";
import { signExistingPdf, signImageAsPdf } from "./signDoc";

// A transparent-background "signature" PNG and a white "BOL photo" JPEG,
// standing in for the browser-produced bytes so we can exercise the real
// pdf-lib compositing (embed + rotation math + save) headlessly.
async function sigPng(): Promise<Uint8Array> {
  const buf = await sharp({
    create: {
      width: 240,
      height: 90,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    // a small opaque stroke so it's not fully blank
    .composite([
      {
        input: await sharp({
          create: {
            width: 200,
            height: 8,
            channels: 4,
            background: { r: 20, g: 20, b: 30, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        top: 40,
        left: 20,
      },
    ])
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

async function bolJpg(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

async function blankPdf(pages: number, rotate = 0): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = pdf.addPage([612, 792]); // US Letter points
    if (rotate) p.setRotation(degrees(rotate));
  }
  return pdf.save();
}

describe("signDoc compositing", () => {
  it("stamps a signature onto an existing PDF, keeps the page count, grows the file", async () => {
    const src = await blankPdf(2);
    const png = await sigPng();
    const out = await signExistingPdf(
      src,
      1,
      { cx: 300, cy: 200, rotationDeg: 0, widthPts: 200 },
      { pngBytes: png, aspect: 90 / 240, printName: "Jane Receiver", dateStr: "07/09/2026" },
    );
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
    expect(out.byteLength).toBeGreaterThan(src.byteLength);
  });

  it("handles a rotated page without throwing and returns a valid PDF", async () => {
    const src = await blankPdf(1, 90);
    const png = await sigPng();
    const out = await signExistingPdf(
      src,
      0,
      { cx: 300, cy: 200, rotationDeg: 90, widthPts: 180 },
      { pngBytes: png, aspect: 90 / 240 },
    );
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("clamps an out-of-range page index to the last page", async () => {
    const src = await blankPdf(1);
    const png = await sigPng();
    const out = await signExistingPdf(
      src,
      99,
      { cx: 100, cy: 100, rotationDeg: 0, widthPts: 150 },
      { pngBytes: png, aspect: 0.375 },
    );
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it("builds a one-page signed PDF from an image BOL sized to the image", async () => {
    const jpg = await bolJpg(800, 600);
    const png = await sigPng();
    const out = await signImageAsPdf(
      jpg,
      800,
      600,
      { cx: 400, cy: 150, rotationDeg: 0, widthPts: 260 },
      { pngBytes: png, aspect: 90 / 240, printName: "Rec", dateStr: "07/09/2026" },
    );
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
    const { width, height } = reloaded.getPage(0).getSize();
    expect(Math.round(width)).toBe(800);
    expect(Math.round(height)).toBe(600);
  });
});
