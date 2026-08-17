/**
 * Shared "email-form view" wrapper — takes a persisted `preview_html`
 * snapshot and wraps it in a thin operator-facing meta header strip
 * (From / To / Subject / Sent-at) so dispatch sees the context a real
 * inbox would have shown the recipient. Used identically by the
 * estimate/finalized-quote/BOL "View email" viewer routes in both
 * /admin and /tms-v2 — previously three separately-copy-pasted
 * near-identical route bodies.
 */

export type PreviewEmailMeta = {
  title: string;
  subject: string | null;
  to: string | null;
  from: string | null;
  replyTo: string | null;
  sentAt: string | null;
  html: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPreviewEmailWrapper(meta: PreviewEmailMeta): string {
  const subject = escapeHtml(meta.subject ?? "(no subject)");
  const to = escapeHtml(meta.to ?? "—");
  const from = escapeHtml(meta.from ?? "—");
  const replyTo = escapeHtml(meta.replyTo ?? "");
  const sentAt = meta.sentAt
    ? escapeHtml(new Date(meta.sentAt).toLocaleString("en-US"))
    : "—";
  const title = escapeHtml(meta.title);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} — ${subject}</title>
<style>
  body { margin: 0; background: #f4f1ea; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #000; }
  .meta { background: #fafaf6; border-bottom: 2px solid #000; padding: 16px 20px; font-size: 13px; line-height: 1.5; }
  .meta dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
  .meta dt { font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; font-size: 10.5px; color: #000; padding-top: 2px; }
  .meta dd { margin: 0; font-size: 13px; word-break: break-word; }
  .body { padding: 0; }
</style>
</head>
<body>
  <div class="meta">
    <dl>
      <dt>From</dt><dd>${from}</dd>
      <dt>To</dt><dd>${to}</dd>
      ${replyTo ? `<dt>Reply&#8209;To</dt><dd>${replyTo}</dd>` : ""}
      <dt>Subject</dt><dd>${subject}</dd>
      <dt>Sent</dt><dd>${sentAt}</dd>
    </dl>
  </div>
  <div class="body">${meta.html}</div>
</body>
</html>`;
}
