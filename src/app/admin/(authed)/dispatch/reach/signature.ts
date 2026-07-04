/**
 * Backhaul Reach — branded email signature footer.
 *
 * Shared by the outgoing email (send-actions renderHtml, ABSOLUTE logo URL) and
 * the in-app "what a broker sees" preview (relative logo URL). Client-and-server
 * safe: no "use server", no DB. Email-safe HTML: tables + inline styles only, no
 * SVG (most clients strip it).
 *
 * The logo PNG (public/reach-logo.png) already bakes in "DOT 3918509 | MC
 * 1467901", so it's referenced as a PLAIN inline <img src="…"> — never a
 * CID/inline attachment and never base64 — so Gmail/Outlook render it in the
 * body instead of collapsing it into a photo/attachment card.
 */

const SIG_SANS =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SIG_RED = "#c0272d"; // site V2 accent red
const SIG_INK = "#111111";
const SIG_MUTED = "#555555";

/** Relative asset path used for the in-app preview (in prod the email uses the absolute form). */
export const REACH_PREVIEW_LOGO_URL = "/reach-logo.png";

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

/**
 * The branded signature footer as email-safe HTML. `logoUrl` MUST be absolute
 * for real email (relative is fine only for the in-app preview). Left: the logo
 * (carries DOT/MC). Then a subtle vertical divider (a 1px left border) and the
 * right column with name, title, phone, and the two emails.
 */
export function reachSignatureHtml(logoUrl: string): string {
  const p = (inner: string, style = "") =>
    `<p style="margin:0;font-family:${SIG_SANS};line-height:1.45;${style}">${inner}</p>`;
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:26px">
  <tr><td style="border-top:1px solid #e2e2e2;padding-top:18px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
      <tr>
        <td valign="middle" style="vertical-align:middle;padding-right:20px">
          <img src="${esc(logoUrl)}" alt="Harblanc Services LLC" width="180" style="display:block;width:180px;height:auto;max-width:180px;border:0;outline:0" />
        </td>
        <td valign="middle" style="vertical-align:middle;padding-left:20px;border-left:1px solid #e2e2e2">
          ${p(`<span style="font-size:15px;font-weight:700;letter-spacing:0.02em;color:${SIG_INK}">BRENT HARBAUGH</span>`)}
          ${p(`<span style="font-size:13px;color:${SIG_MUTED}">President of Harblanc Services</span>`, "margin-top:2px")}
          ${p(`<a href="tel:8324458775" style="font-size:13px;color:${SIG_INK};text-decoration:none">(832) 445-8775</a>`, "margin-top:9px")}
          ${p(`<a href="mailto:Brenth@Harblancservices.com" style="font-size:13px;color:${SIG_RED};text-decoration:none">Brenth@Harblancservices.com</a>`, "margin-top:3px")}
          ${p(`<a href="mailto:Dispatch@Harblancservices.com" style="font-size:13px;color:${SIG_RED};text-decoration:none">Dispatch@Harblancservices.com</a>`, "margin-top:3px")}
        </td>
      </tr>
    </table>
  </td></tr>
</table>`;
}

/**
 * Plain-text signature for the text/plain part — so a reader whose client blocks
 * images still gets everything the footer image + right column convey.
 */
export const REACH_TEXT_SIGNATURE = [
  "--",
  "Brent Harbaugh",
  "President of Harblanc Services",
  "DOT 3918509 | MC 1467901",
  "(832) 445-8775",
  "Brenth@Harblancservices.com",
  "Dispatch@Harblancservices.com",
].join("\n");
