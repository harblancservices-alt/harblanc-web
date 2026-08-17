import { readFileSync } from "fs";
import { join } from "path";

let registered = false;

/**
 * Registers "CrmSans" (LiberationSans, metric-compatible with Helvetica/
 * Arial, public/fonts/ — same LICENSE_LIBERATION-covered files pdfjs-dist
 * itself ships as ITS OWN Helvetica substitute) as an EMBEDDED font for
 * @react-pdf/renderer, so CrmRateConfirmationPDF.tsx/CrmShipmentBolPDF.tsx's
 * generated PDFs carry their own glyph outlines instead of referencing the
 * PDF standard "Helvetica" font by name only (which every PDF *reader* is
 * expected to substitute locally, with no source of truth inside the file
 * itself).
 *
 * This replaces relying on pdfPageThumbnail.ts's standardFontDataUrl to
 * supply glyphs for those un-embedded fonts at RASTER time — that fix was
 * correct in principle but couldn't be made to reliably land in Vercel's
 * deployed function (multiple outputFileTracingIncludes attempts confirmed
 * present in the LOCAL trace manifest and even in the deployed function's
 * measured size, and it STILL silently produced wordless thumbnails —
 * confirmed by downloading the actual stored .thumb.v2.png bytes, not by
 * trusting clean logs, which said nothing because a missing external font
 * is a pdf.js WARNING, not a thrown error). Embedding sidesteps the whole
 * problem: pdf.js's rasterizer only needs glyphs that are already inside
 * the PDF it's given, so this makes the PDF portable rather than the
 * function-image tracing reliable.
 *
 * Read via readFileSync(join(process.cwd(), ...)) and passed as a base64
 * data: URI — the exact same proven-reliable pattern brandLogo.ts already
 * uses for the logo image, which HAS rendered correctly in every deploy so
 * far: public/ is a first-class Next.js static-asset directory, always
 * fully included in every deployment by design, unlike an arbitrary
 * node_modules subpath that depends on file-tracing actually working. A
 * data: URI (not a raw Buffer) because @react-pdf/font's own TypeScript
 * types declare `src: string` — passing bytes we already read ourselves,
 * just string-encoded, keeps this off of @react-pdf/renderer's own
 * URL/file-fetch resolution path entirely (the exact category of "works
 * locally, silently doesn't in the deployed function" risk this whole fix
 * exists to eliminate) without fighting the type checker.
 */
export async function registerCrmSansFont(): Promise<void> {
  if (registered) return;
  const { Font } = await import("@react-pdf/renderer");
  const dir = join(process.cwd(), "public/fonts");
  const toDataUri = (fileName: string) =>
    `data:font/ttf;base64,${readFileSync(join(dir, fileName)).toString("base64")}`;
  Font.register({
    family: "CrmSans",
    fonts: [
      { src: toDataUri("LiberationSans-Regular.ttf") },
      { src: toDataUri("LiberationSans-Bold.ttf"), fontWeight: 700 },
      { src: toDataUri("LiberationSans-Italic.ttf"), fontStyle: "italic" },
    ],
  });
  registered = true;
}
