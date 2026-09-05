/**
 * MANUAL render proof for CrmRateConfirmationPDF — skipped by default so it
 * never runs in `npm test`. Run it deliberately with:
 *
 *   npx vitest run src/lib/pdf/rcRenderProof.manual.test.ts --testNamePattern=. \
 *     --config vitest.config.ts
 *
 * ...after flipping `describe.skip` to `describe`, or via RC_RENDER_PROOF=1.
 *
 * It renders the real component through the real renderCrmRateConfirmationPdfBuffer()
 * path with a REPRESENTATIVE shipment snapshot (shape-identical to what
 * generateRateConfirmation() builds) and rasterizes page 1 to
 * _mockups_tmp/RC_LIVE_after.png so the shipped output can be compared to the
 * approved mockup by eye. Nothing here feeds production.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { renderCrmRateConfirmationPdfBuffer } from "./renderCrmRateConfirmationPdf";
import type { CrmRateConfirmationPdfData } from "./CrmRateConfirmationPDF";

const enabled = process.env.RC_RENDER_PROOF === "1";

const sample: CrmRateConfirmationPdfData = {
  rcNumber: "RC-1042",
  issuedDate: "September 5, 2026",
  broker: {
    name: "Hello Hotshot",
    mc: "1336801",
    dot: "3758160",
    address: "3116 North Central Expressway Ste 490, Dallas, TX 75205",
    phone: "9729222282",
    email: "information@hellohotshot.co",
  },
  shipment: {
    shipmentNumber: "PROJ-HH-114",
    equipment: "Flatbed Hotshot",
    commodity: "Crated Patio Furniture",
    weight: "4,200 lbs",
    pieces: "2",
    poNumber: null,
    refNumbers: null,
    lengthIn: 44,
    widthIn: 44,
    heightIn: 44,
  },
  pickup: {
    name: "Dallas Studio",
    address: "1300 S Polk St",
    city: "dallas",
    state: "tx",
    zip: "75224",
    contact: "MARIA GUTIERREZ",
    phone: "2145550118",
    dateLabel: "September 8, 2026",
    timeLabel: "8:00 AM – 9:00 AM",
    window: null,
    number: "069420",
    notes: null,
  },
  delivery: {
    name: "Raising Cane's Distribution",
    address: "6800 Bishop Rd",
    city: "plano",
    state: "tx",
    zip: "75024",
    contact: "andre boone",
    phone: "9725550144",
    dateLabel: "September 8, 2026",
    timeLabel: "9:00 AM – 12:00 PM",
    window: null,
    number: "069420",
    notes: "Dock 12. Driver checks in at guard shack.",
  },
  carrier: {
    name: "Redline Expedite LLC",
    mc: "1104772",
    dot: "3391208",
    contact: "kartik rathore",
    phone: "4695550193",
    email: "dispatch@redlineexpedite.com",
  },
  specialInstructions: "Load must be tarped. Two straps minimum per crate.",
  lines: [{ label: "Linehaul", amount: 4000 }],
  totalCarrierPay: 4000,
  paymentTerms: "Net 30 from signed POD",
  quickPay: "2% / 3 days",
  notes: null,
};

describe.skipIf(!enabled)("CrmRateConfirmationPDF render proof", () => {
  it("renders page 1 to _mockups_tmp/RC_LIVE_after.png", async () => {
    const pdf = await renderCrmRateConfirmationPdfBuffer(sample);
    expect(pdf.byteLength).toBeGreaterThan(1000);

    const outDir = join(process.cwd(), "_mockups_tmp");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "RC_LIVE_after.pdf"), pdf);

    const [{ createCanvas }, pdfjsLib, pdfjsWorker, { createRequire }, { dirname }] = await Promise.all([
      import("@napi-rs/canvas"),
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      // @ts-expect-error — pdfjs-dist ships no .d.ts for this worker entry point.
      import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
      import("node:module"),
      import("node:path"),
    ]);
    (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

    const require = createRequire(import.meta.url);
    const standardFontDataUrl = `${join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}/`;

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdf), standardFontDataUrl }).promise;
    expect(doc.numPages).toBe(1); // the redesign must still fit ONE page
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1700 / base.width });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: null,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    writeFileSync(join(outDir, "RC_LIVE_after.png"), canvas.toBuffer("image/png"));
  }, 120_000);
});
