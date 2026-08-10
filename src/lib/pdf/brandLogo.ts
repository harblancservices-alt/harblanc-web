import { readFileSync } from "fs";
import { join } from "path";

let cached: string | null = null;

/**
 * Hello Hotshot's brand mark for PDF letterheads, base64-inlined from
 * public/brand/hello-hotshot-logo.png. The admin/dispatch PDFs (BillOfLadingPDF.tsx,
 * FinalizedQuotePDF.tsx, RangeProposalPDF.tsx) pull their logo from a
 * runtime HTTP URL, but @react-pdf/renderer's server-side renderer can't
 * reliably depend on that working during generation (network reachability,
 * dev vs prod origin, etc.) — reading the file straight off disk and
 * inlining it as a data URI has no such dependency. Read once per server
 * process and cached, since the file never changes at runtime.
 */
export function getHelloHotshotLogoDataUri(): string {
  if (cached) return cached;
  const bytes = readFileSync(join(process.cwd(), "public/brand/hello-hotshot-logo.png"));
  cached = `data:image/png;base64,${bytes.toString("base64")}`;
  return cached;
}
