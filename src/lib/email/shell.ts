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
 *     3 stacked mono lines: OWNER-OPERATED / LICENSED & INSURED / EST. 2022
 *
 *   CONTENT (white) — email body slot, untouched
 *
 *   FOOTER (black + topo SVG)
 *     2-col grid:
 *       Brand:    logo + 3-line tagline
 *       DISPATCH: email / phone / USDOT / MC (red mono header)
 *     SITE column (Home/Services/Contact) was removed — customer
 *     emails don't need website navigation.
 *     hairline
 *     bottom bar: © {year} HARBLANC ... | LICENSED & INSURED MOTOR CARRIER
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

          <!-- ── HEADER — site footer Col 1, centered ─────────────────── -->
          <tr>
            <td align="center" bgcolor="#000000" style="background-color:#000000;background-image:url('${topoUrl}');background-size:600px 600px;background-repeat:repeat;padding:30px 22px 24px">
              <img src="${escapeHtml(logoUrl)}" alt="HARBLANC Services LLC" width="220" height="auto" style="display:inline-block;width:220px;height:auto;max-width:100%;border:0;outline:0" />
              <!-- Verbatim from Footer.tsx lines 76-80: font-mono text-[11px]
                   tracking-[0.18em] uppercase white weight 500 -->
              <p style="margin:16px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.18em;color:#ffffff;text-transform:uppercase;text-align:center;line-height:1.9">Owner-Operated</p>
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.18em;color:#ffffff;text-transform:uppercase;text-align:center;line-height:1.9">Licensed &amp; Insured</p>
              <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.18em;color:#ffffff;text-transform:uppercase;text-align:center;line-height:1.9">Est. 2022</p>
            </td>
          </tr>

          <!-- ── CONTENT — white slot, body owns its own padding ──────── -->
          <tr>
            <td style="padding:0;background:#ffffff">
              ${input.contentHtml}
            </td>
          </tr>

          <!-- ── FOOTER — site footer ported: 3-col grid + bottom bar ── -->
          <tr>
            <td bgcolor="#000000" style="background-color:#000000;background-image:url('${topoUrl}');background-size:600px 600px;background-repeat:repeat;padding:30px 24px 20px">

              <!-- Wrapper table — 3 logical rows: (1) 2-col grid,
                   (2) 24px spacer, (3) hairline + bottom bar. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">

                <!-- ROW 1 — Brand | DISPATCH -->
                <tr>
                  <td valign="top" style="vertical-align:top;padding:0">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
                      <tr>
                        <!-- Col 1 — Brand (logo + 3-line tagline) -->
                        <td width="46%" valign="top" style="width:46%;vertical-align:top;padding-right:18px">
                          <img src="${escapeHtml(logoUrl)}" alt="HARBLANC" width="140" height="auto" style="display:block;width:140px;height:auto;max-width:100%;border:0;outline:0" />
                          <p style="margin:14px 0 0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.18em;color:#ffffff;text-transform:uppercase;line-height:1.9">Owner-Operated</p>
                          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.18em;color:#ffffff;text-transform:uppercase;line-height:1.9">Licensed &amp; Insured</p>
                          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.18em;color:#ffffff;text-transform:uppercase;line-height:1.9">Est. 2022</p>
                        </td>

                        <!-- Col 2 — DISPATCH (email, phone, USDOT, MC) -->
                        <td width="54%" valign="top" style="width:54%;vertical-align:top">
                          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:13px;font-weight:700;letter-spacing:0.22em;color:#ef4444;text-transform:uppercase;line-height:1.4">Dispatch</p>
                          <p style="margin:18px 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:#ffffff;line-height:1.5;word-break:break-word"><a href="${escapeHtml(mailHref)}" style="color:#ffffff;text-decoration:none">${escapeHtml(company.dispatchEmail)}</a></p>
                          <p style="margin:10px 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:#ffffff;line-height:1.4"><a href="${escapeHtml(phoneHref)}" style="color:#ffffff;text-decoration:none">${escapeHtml(company.dispatchPhone)}</a></p>
                          <p style="margin:14px 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:#ffffff;line-height:1.4">USDOT ${escapeHtml(company.dotNumber)}</p>
                          <p style="margin:6px 0 0;font-family:${SANS};font-size:13px;font-weight:500;color:#ffffff;line-height:1.4">MC ${escapeHtml(company.mcNumber)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- ROW 2 — 24px spacer between top grid and bottom bar -->
                <tr>
                  <td style="font-size:1px;line-height:1px;height:24px">&nbsp;</td>
                </tr>

                <!-- ROW 3 — hairline + bottom bar (copyright | L&I MC) -->
                <tr>
                  <td style="border-top:1px solid #262626;padding:14px 0 0">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">
                      <tr>
                        <td valign="middle" align="left" style="vertical-align:middle">
                          <p style="margin:0;font-family:${SANS};font-size:11px;font-weight:500;color:#ffffff;line-height:1.5">&copy; ${year} ${escapeHtml(company.legalName)}. All Rights Reserved.</p>
                        </td>
                        <td valign="middle" align="right" style="vertical-align:middle;text-align:right">
                          <p style="margin:0;font-family:${SANS};${MONO_FEATURES};font-size:11px;font-weight:500;letter-spacing:0.22em;color:#ffffff;text-transform:uppercase;line-height:1.5">Licensed &amp; Insured Motor Carrier</p>
                        </td>
                      </tr>
                    </table>
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
    `Owner-Operated · Licensed & Insured · Est. 2022`,
    "────────────────────────────────────────",
    "",
    input.contentText,
    "",
    "────────────────────────────────────────",
    "DISPATCH",
    `${company.dispatchEmail}`,
    `${company.dispatchPhone}`,
    `USDOT ${company.dotNumber} · MC ${company.mcNumber}`,
    "",
    `© ${year} ${company.legalName}. All Rights Reserved.`,
    "Licensed & Insured Motor Carrier",
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
