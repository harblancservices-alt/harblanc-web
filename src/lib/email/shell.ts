import { company } from "@/lib/company";

/**
 * HARBLANC email shell — centered white letterhead, white credentials
 * strip, white document strip, content slot, signature footer.
 *
 * Phase HEADER-LITE (2026-05-25): pulled out the black regulatory band
 * and the dark dispatch packet strip. Read as "less AI looking" — too
 * much tactical chrome compressed against the masthead. New header is
 * three centered white blocks separated by hairlines:
 *
 *   1. LETTERHEAD     — centered HARBLANC lockup + carrier tagline
 *   2. CREDENTIALS    — centered USDOT · MC · Licensed & Insured
 *                       (black text on white, red middle-dots)
 *   3. DOCUMENT STRIP — centered DATE | DOC | REF (red labels, gray
 *                       pipes, black values on white)
 *
 * The body bands (Quote summary / Rate breakdown / Confirmation /
 * Accept-Decline) and the signature footer at the bottom are unchanged.
 *
 * Asset:
 *   https://{domain}/brand/logo-horizontal.png (843×185, 178 KB)
 *   — the navbar/footer lockup. Dark-on-light, designed for white
 *   backgrounds. Renders cleanly without theatrics.
 */

export type EmailShellInput = {
  preheader: string;
  contentHtml: string;
  contentText: string;
  refNumber: string;
  docType: string;
  /**
   * When true (default), the closing signature block — "— Brent",
   * USDOT / MC / OPERATES grid, DISPATCH / EMAIL directory — is
   * appended after the content slot. Set false for documents that
   * end in their own action area (the estimate email's Accept /
   * Decline band) so the document closes cleanly without a
   * redundant signature.
   */
  includeSignatureFooter?: boolean;
};

const PUBLIC_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.harblancservices.com";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      } as Record<string, string>
    )[c]!,
  );
}

function formatPacketDate(d: Date): string {
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const yr = d.getUTCFullYear();
  const mo = months[d.getUTCMonth()];
  const dy = String(d.getUTCDate()).padStart(2, "0");
  return `${yr} · ${mo} · ${dy}`;
}

export function renderEmailShell(input: EmailShellInput): {
  html: string;
  text: string;
} {
  // Operator-supplied horizontal lockup with black-outlined HARBLANC
  // wordmark. Same asset shipped on the PDF so email and PDF brand
  // identities stay in lockstep.
  const logoUrl = `${PUBLIC_ORIGIN}/brand/harblanc-pro.png`;
  const issuedDate = formatPacketDate(new Date());
  // Phase HEADER-LITE-2: bottom signature footer dropped entirely.
  // The signature footer used to be a dark band carrying "— Brent",
  // USDOT/MC grid, and DISPATCH/EMAIL links. The credentials migrate
  // to the top black masthead bar; the signature line becomes a
  // closing-line responsibility (operator typed at intake time).
  // `includeSignatureFooter` is kept on the input type so older
  // callers still compile, but it's now a no-op.
  void input.includeSignatureFooter;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#e5e5e5;color:#0a0a0a;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;font-size:15px">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e5e5e5;opacity:0">${escapeHtml(input.preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#e5e5e5">
    <tr>
      <td align="center" style="padding:10px 8px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;border:1px solid #d4d4d8">

          <!-- ───── TOP CREDENTIALS BAR — black band, white text, red middle-dots ───── -->
          <tr>
            <td align="center" style="padding:8px 22px;background:#0a0a0a">
              <p style="margin:0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#ffffff;text-transform:uppercase;font-weight:700;text-align:center">
                ${escapeHtml(company.dot)}&nbsp;<span style="color:#dc2626">&middot;</span>&nbsp;${escapeHtml(company.mc)}&nbsp;<span style="color:#dc2626">&middot;</span>&nbsp;${escapeHtml(company.authorityText)}
              </p>
            </td>
          </tr>

          <!-- ───── LETTERHEAD — centered horizontal lockup + tagline ───── -->
          <tr>
            <td align="center" style="padding:14px 22px 10px;background:#ffffff">
              <img src="${escapeHtml(logoUrl)}" alt="HARBLANC Services LLC" width="240" height="80" style="display:inline-block;width:240px;height:auto;max-width:100%;border:0;outline:0;background:#ffffff" />
              <p style="margin:8px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#0a0a0a;text-transform:uppercase;font-weight:700;text-align:center">Direct freight dispatch &nbsp;·&nbsp; Owner-operated motor carrier</p>
            </td>
          </tr>

          <!-- ───── DOCUMENT STRIP — DATE / DOC / REF on white, red labels ───── -->
          <tr>
            <td align="center" style="padding:5px 22px 8px;background:#ffffff;border-top:1px solid #d4d4d8;border-bottom:1px solid #d4d4d8">
              <p style="margin:0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#0a0a0a;text-transform:uppercase;font-weight:700;text-align:center">
                <span style="color:#dc2626">Date</span>&nbsp;&nbsp;${escapeHtml(issuedDate)}&nbsp;&nbsp;<span style="color:#d4d4d8">|</span>&nbsp;&nbsp;<span style="color:#dc2626">Doc</span>&nbsp;&nbsp;${escapeHtml(input.docType)}&nbsp;&nbsp;<span style="color:#d4d4d8">|</span>&nbsp;&nbsp;<span style="color:#dc2626">Ref</span>&nbsp;&nbsp;${escapeHtml(input.refNumber)}
              </p>
            </td>
          </tr>

          <!-- ───── CONTENT ───── -->
          <tr>
            <td style="padding:0;background:#ffffff">
              ${input.contentHtml}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body></html>`;

  // Plaintext mirrors the HTML: credentials at the top, document
  // strip below, content. No bottom signature block — the HTML side
  // dropped it too, so plaintext follows.
  const text = [
    `HARBLANC SERVICES LLC`,
    `${company.dot} · ${company.mc} · ${company.authorityText}`,
    "────────────────────────────────────────",
    `DATE  ${issuedDate}    DOC  ${input.docType}    REF  ${input.refNumber}`,
    "────────────────────────────────────────",
    "",
    input.contentText,
  ].join("\n");

  return { html, text };
}

/**
 * Compress a UUID into a tracking-style ref number used in subject lines,
 * preheader text, and the REF strip. e.g. "9d92f2a1-3b7c-4f2e-8a45-1c3b9e7d4a2f"
 * becomes "A4F2-9B1C" — last 8 hex chars, upper-case, hyphenated.
 */
export function refNumber(leadId: string): string {
  const hex = leadId.replace(/-/g, "");
  if (hex.length < 8) return leadId.toUpperCase();
  const tail = hex.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

export { escapeHtml };
