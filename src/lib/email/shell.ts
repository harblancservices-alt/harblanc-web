import { company } from "@/lib/company";

/**
 * HARBLANC email shell — flat letterhead masthead, regulatory band,
 * dispatch packet strip, content slot, signature footer, REF strip.
 *
 * Phase 3D-vis-pass2 (2026-05-22): rebuilt the header as a real freight
 * letterhead. White paper masthead with the horizontal HARBLANC lockup
 * left-aligned. Black regulatory band below it carrying USDOT / MC /
 * Licensed & Insured the way federally-required carrier identification
 * lives on real dispatch paperwork. Then a dark dispatch-packet strip
 * with DATE / DOC / REF. Four flat bands, no cinematic art, no centered
 * hero, no decorative background.
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
  const phoneDigits = company.dispatchPhone.replace(/[^\d+]/g, "");
  const logoUrl = `${PUBLIC_ORIGIN}/brand/logo-horizontal.png`;
  const issuedDate = formatPacketDate(new Date());
  const showSignature = input.includeSignatureFooter !== false;

  const signatureFooterHtml = showSignature
    ? `<!-- ───── SIGNATURE FOOTER ───── -->
          <tr>
            <td style="padding:0;background:#dc2626;font-size:1px;line-height:1px">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:0;background:#0a0a0a">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td width="4" style="width:4px;background:#dc2626;font-size:1px;line-height:1px">&nbsp;</td>
                  <td style="padding:18px 22px 18px">
                    <p style="margin:0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;">&mdash; Brent</p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:12px 0 0">
                      <tr>
                        <td style="padding:0 14px 0 0;border-right:1px solid #404040;vertical-align:top">
                          <p style="margin:0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:9px;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;font-weight:700">USDOT</p>
                          <p style="margin:2px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:13px;color:#ffffff;font-weight:700">${escapeHtml(company.dotNumber)}</p>
                        </td>
                        <td style="padding:0 14px;border-right:1px solid #404040;vertical-align:top">
                          <p style="margin:0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:9px;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;font-weight:700">MC</p>
                          <p style="margin:2px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:13px;color:#ffffff;font-weight:700">${escapeHtml(company.mcNumber)}</p>
                        </td>
                        <td style="padding:0 0 0 14px;vertical-align:top">
                          <p style="margin:0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:9px;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;font-weight:700">Operates</p>
                          <p style="margin:2px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:13px;color:#ffffff;font-weight:600">${escapeHtml(company.serviceArea)}</p>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:14px 0 0;border-top:1px solid #404040;width:100%">
                      <tr>
                        <td style="padding:10px 0 4px;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:9px;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;font-weight:700;width:120px;vertical-align:middle">Dispatch</td>
                        <td style="padding:10px 0 4px;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:14px;color:#ffffff;font-weight:700;vertical-align:middle"><a href="tel:${escapeHtml(phoneDigits)}" style="color:#ffffff;text-decoration:none">${escapeHtml(company.dispatchPhone)}</a></td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:9px;letter-spacing:0.22em;color:#dc2626;text-transform:uppercase;font-weight:700;vertical-align:middle">Email</td>
                        <td style="padding:4px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#ffffff;font-weight:500;vertical-align:middle"><a href="mailto:${escapeHtml(company.dispatchEmail)}" style="color:#ffffff;text-decoration:none">${escapeHtml(company.dispatchEmail)}</a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#e5e5e5;color:#0a0a0a;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;font-size:15px">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e5e5e5;opacity:0">${escapeHtml(input.preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#e5e5e5">
    <tr>
      <td align="center" style="padding:20px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff;border:1px solid #d4d4d8">

          <!-- ───── LETTERHEAD — flat white band, logo left-aligned + carrier tagline ───── -->
          <tr>
            <td style="padding:24px 22px 20px;background:#ffffff">
              <img src="${escapeHtml(logoUrl)}" alt="HARBLANC Services LLC" width="250" height="54" style="display:block;width:250px;height:auto;max-width:100%;border:0;outline:0;background:#ffffff" />
              <p style="margin:12px 0 0;font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#0a0a0a;text-transform:uppercase;font-weight:700">Direct freight dispatch &nbsp;·&nbsp; Owner-operated motor carrier</p>
            </td>
          </tr>

          <!-- Red rule between letterhead and regulatory band -->
          <tr>
            <td style="padding:0;background:#dc2626;font-size:1px;line-height:1px">&nbsp;</td>
          </tr>

          <!-- ───── REGULATORY BAND — USDOT / MC / Licensed (federally-required carrier ID strip on real paperwork) ───── -->
          <tr>
            <td style="padding:8px 22px;background:#0a0a0a">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td style="font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#ffffff;text-transform:uppercase;font-weight:700">
                    ${escapeHtml(company.dot)} &nbsp;&middot;&nbsp; ${escapeHtml(company.mc)} &nbsp;&middot;&nbsp; ${escapeHtml(company.authorityText)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ───── DISPATCH PACKET STRIP — DATE / DOC / REF (no decorative pill) ───── -->
          <tr>
            <td style="padding:9px 22px;background:#171717;border-top:1px solid #262626">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td style="font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#fafafa;text-transform:uppercase;font-weight:700;width:33%">
                    <span style="color:#dc2626">Date</span>&nbsp;&nbsp;${escapeHtml(issuedDate)}
                  </td>
                  <td align="center" style="font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#fafafa;text-transform:uppercase;font-weight:700">
                    <span style="color:#dc2626">Doc</span>&nbsp;&nbsp;${escapeHtml(input.docType)}
                  </td>
                  <td align="right" style="font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0;font-size:10px;letter-spacing:0.22em;color:#fafafa;text-transform:uppercase;font-weight:700;width:33%">
                    <span style="color:#dc2626">Ref</span>&nbsp;&nbsp;${escapeHtml(input.refNumber)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ───── CONTENT ───── -->
          <tr>
            <td style="padding:0;background:#ffffff">
              ${input.contentHtml}
            </td>
          </tr>

          ${signatureFooterHtml}

        </table>
      </td>
    </tr>
  </table>
</body></html>`;

  const signatureTextLines = showSignature
    ? [
        "",
        "────────────────────────────────────────",
        "— Brent",
        "",
        `USDOT  ${company.dotNumber}`,
        `MC     ${company.mcNumber}`,
        `OPERATES  ${company.serviceArea} · ${company.dispatchModel}`,
        "",
        `DIRECT DISPATCH:  ${company.dispatchPhone}`,
        company.dispatchEmail,
      ]
    : [];

  const text = [
    `HARBLANC SERVICES LLC`,
    `${company.dot} · ${company.mc} · ${company.authorityText}`,
    "────────────────────────────────────────",
    `DATE  ${issuedDate}    DOC  ${input.docType}    REF  ${input.refNumber}`,
    "────────────────────────────────────────",
    "",
    input.contentText,
    ...signatureTextLines,
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
