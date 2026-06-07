import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Email-form view of a sent Finalized Quote.
 *
 *   GET /admin/quotes/<quoteRequestId>/finalized-quote-email/<finalizedQuoteId>
 *
 * Returns the persisted `preview_html` bytes wrapped in a thin
 * operator-facing header strip (From / To / Subject / Sent-at).
 * Same auth + caching policy as the Range proposal email route.
 */

type FqEmailRow = {
  id: string;
  quote_request_id: string;
  preview_html: string | null;
  preview_subject: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  sent_at: string | null;
};

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string; finalizedQuoteId: string }>;
  },
): Promise<Response> {
  await requireAdmin();

  const { id: quoteRequestId, finalizedQuoteId } = await context.params;
  if (!quoteRequestId || !finalizedQuoteId) {
    return NextResponse.json(
      { error: "Missing identifiers." },
      { status: 400 },
    );
  }

  const sb = createServiceRoleClient();
  const { data: row, error } = await sb
    .from("finalized_quotes")
    .select(
      "id, quote_request_id, preview_html, preview_subject, preview_to, preview_from, preview_reply_to, sent_at",
    )
    .eq("id", finalizedQuoteId)
    .eq("quote_request_id", quoteRequestId)
    .maybeSingle<FqEmailRow>();
  if (error) {
    return NextResponse.json(
      { error: `Finalized quote lookup failed: ${error.message}` },
      { status: 500 },
    );
  }
  if (!row || !row.preview_html) {
    return NextResponse.json(
      { error: "No email preview stored for this finalized quote." },
      { status: 404 },
    );
  }

  const subject = escapeHtml(row.preview_subject ?? "(no subject)");
  const to = escapeHtml(row.preview_to ?? "—");
  const from = escapeHtml(row.preview_from ?? "—");
  const replyTo = escapeHtml(row.preview_reply_to ?? "");
  const sentAt = row.sent_at
    ? escapeHtml(new Date(row.sent_at).toLocaleString("en-US"))
    : "—";

  const wrapper = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Finalized quote email — ${subject}</title>
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
  <div class="body">${row.preview_html}</div>
</body>
</html>`;

  return new Response(wrapper, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
