import { company } from "@/lib/company";

/**
 * HARBLANC CUSTOMER EMAIL SHELL — site-footer port (2026-06-03).
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURAL BOUNDARY — READ BEFORE EDITING                    │
 * │                                                                  │
 * │  This shell is used ONLY for customer-facing emails:             │
 * │     • Acknowledgement      (render.ts)                           │
 * │     • Quote Range          (render.ts)                           │
 * │     • Finalized Quote      (finalized-quote.ts)                  │
 * │                                                                  │
 * │  This shell is NOT used for the Bill of Lading. BOL is a         │
 * │  paperwork document, not a customer email — it owns its own      │
 * │  renderer in bill-of-lading.ts (renderBolEmail). Do NOT route    │
 * │  BOL through this shell. Do NOT add BOL-style elements here.     │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Visual reference: the actual website footer (src/components/site/
 * Footer.tsx). Header + footer here port that footer's typography,
 * layout, and assets verbatim, just compressed to email-safe HTML:
 *
 *   HEADER (black + topo SVG)
 *     centered logo (Reverse-on-dark)
 *
 *   CONTENT (white) — email body slot, untouched
 *
 *   FOOTER (black + topo SVG)
 *     2-col grid (vertically centered):
 *       Brand:    logo only
 *       DISPATCH: email / phone (red mono header)
 *     hairline
 *     bottom bar: © {year} HARBLANC ... All Rights Reserved. (centered)
 *
 * Colors taken from the site: bg-black (#000000), red-500 (#ef4444),
 * neutral-800 border (#262626), white text everywhere else.
 */

export type EmailShellInput = {
  preheader: string;
  contentHtml: string;
  contentText: string;
  /** Vestigial — kept on the type so existing callers compile. */
  refNumber: string;
  /** Vestigial — kept on the type so existing callers compile. */
  docType: string;
  /** Vestigial — kept on the type so existing callers compile. */
  includeSignatureFooter?: boolean;
};

const SANS =
  "'Public Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_FEATURES =
  "font-variant-numeric:tabular-nums lining-nums;font-feature-settings:'tnum' 1,'lnum' 1,'zero' 0";

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

export function renderEmailShell(input: EmailShellInput): {
  html: string;
  text: string;
} {
  void input.refNumber;
  void input.docType;
  void input.includeSignatureFooter;

  // Same assets the website footer uses:
  //   BrandLogo variant="inverted"  →  /brand/Reverse-on-dark.png
  //   Topographic SVG               →  /brand/footer-topo.svg
  const logoUrl = `${PUBLIC_ORIGIN}/brand/Reverse-on-dark.png`;
  const topoUrl = `${PUBLIC_ORIGIN}/brand/footer-topo.svg`;
  const phoneDigits = company.dispatchPhone.replace(/[^\d+]/g, "");
  const mailHref = `mailto:${company.dispatchEmail}`;
  const phoneHref = `tel:${phoneDigits}`;
  const year = new Date().getFullYear();

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:${SANS};line-height:1.5;font-size:15px">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0">${escapeHtml(input.preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
    <tr>
      <td align="center" style="padding:0">

        <!-- 600px card. Header + footer carry bg-black + the SAME topo
             SVG file the site footer uses. Content slot stays pure white. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse;width:100%;max-width:600px;background:#ffffff">

          <!-- ── HEADER — centered logo only ──────────────────────────── -->
          <tr>
            <td align="center" bgcolor="#000000" style="background-color:#000000;background-image:url('${topoUrl}');background-size:600px 600px;background-repeat:repeat;padding:30px 22px 30px">
              <img src="${escapeHtml(logoUrl)}" alt="HARBLANC Services LLC" width="220" height="auto" style="display:inline-block;width:220px;height:auto;max-width:100%;border:0;outline:0" />
            </td>
          </tr>

          <!-- ── CONTENT — white slot, body owns its own padding ──────── -->
          <tr>
            <td style="padding:0;background:#ffffff">
              ${input.contentHtml}
            </td>
          </tr>

          <!-- ── FOOTER — logo | DISPATCH (email + phone) + copyright bar ── -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;background-image:url('${topoUrl}');background-size:600px 600px;background-repeat:repeat;padding:20px 28px 14px">

              <!-- Wrapper table — 3 logical rows: (1) 2-col grid (logo | dispatch),
                   (2) 22px spacer, (3) hairline + centered copyright. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">

                <!-- ROW 1 — Logo | DISPATCH (top-aligned so logo top edge sits
                     at the red DISPATCH label, bottom edge near phone line) -->
                <tr>
                  <td valign="top" style="vertical-align:top;padding:0">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
                      <tr>
                        <!-- Col 1 — Brand logo, top-aligned -->
                        <td width="46%" valign="top" style="width:46%;vertical-align:top;padding-right:18px">
                          <img src="${escapeHtml(logoUrl)}" alt="HARBLANC" width="210" height="auto" style="display:block;width:210px;height:auto;max-width:100%;border:0;outline:0" />
                        </td>

                        <!-- Col 2 — DISPATCH (email + phone), spacing tuned so
                             the block is roughly as tall as the 210px logo. -->
                        <td width="54%" valign="top" style="width:54%;vertical-align:top;padding-top:4px">
                          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:14px;font-weight:700;letter-spacing:0.22em;color:#ef4444;text-transform:uppercase;line-height:1.4">Dispatch</p>
                          <p style="margin:32px 0 0;font-family:${SANS};font-size:15px;font-weight:500;color:#ffffff;line-height:1.4;word-break:break-word"><a href="${escapeHtml(mailHref)}" style="color:#ffffff;text-decoration:none">${escapeHtml(company.dispatchEmail)}</a></p>
                          <p style="margin:12px 0 0;font-family:${SANS};font-size:15px;font-weight:500;color:#ffffff;line-height:1.4"><a href="${escapeHtml(phoneHref)}" style="color:#ffffff;text-decoration:none">${escapeHtml(company.dispatchPhone)}</a></p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ROW 2 — 14px spacer between top grid and bottom bar -->
                <tr>
                  <td style="font-size:1px;line-height:1px;height:14px">&nbsp;</td>
                </tr>

                <!-- ROW 3 — hairline + centered copyright -->
                <tr>
                  <td style="border-top:1px solid #262626;padding:10px 0 0;text-align:center">
                    <p style="margin:0;font-family:${SANS};font-size:11px;font-weight:500;color:#ffffff;line-height:1.5;text-align:center">&copy; ${year} ${escapeHtml(company.legalName)}. All Rights Reserved.</p>
                  </td>
                </tr>

              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body></html>`;

  const text = [
    `HARBLANC SERVICES LLC`,
    "────────────────────────────────────────",
    "",
    input.contentText,
    "",
    "────────────────────────────────────────",
    "DISPATCH",
    `${company.dispatchEmail}`,
    `${company.dispatchPhone}`,
    "",
    `© ${year} ${company.legalName}. All Rights Reserved.`,
  ].join("\n");

  return { html, text };
}

/**
 * Compress a UUID into a tracking-style ref number.
 */
export function refNumber(leadId: string): string {
  const hex = leadId.replace(/-/g, "");
  if (hex.length < 8) return leadId.toUpperCase();
  const tail = hex.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}

export { escapeHtml };
