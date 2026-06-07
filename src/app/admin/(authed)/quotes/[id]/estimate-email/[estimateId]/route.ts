import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Email-form view of a sent Range proposal.
 *
 *   GET /admin/quotes/<quoteRequestId>/estimate-email/<estimateId>
 *
 * Returns the exact `preview_html` bytes that went out to the customer
 * with `Content-Type: text/html`. This is the operator's audit view —
 * "what did the recipient actually see?" — and is the target of the
 * Overview Activity feed's per-row View link for estimate_sent /
 * estimate_resent events.
 *
 * Stateless: re-renders from the persisted preview row. No mutations.
 * Admin-gated identically to the PDF route.
 */

type EstimateEmailRow = {
  id: string;
  quote_request_id: string;
  preview_html: string | null;
  preview_subject: string | null;
  preview_to: string | null;
  preview_from: string | null;
  preview_reply_to: string | null;
  preview_built_at: string | null;
  sent_at: string | null;
};

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string; estimateId: string }>;
  },
): Promise<Response> {
  await requireAdmin();

  const { id: quoteRequestId, estimateId } = await context.params;
  if (!quoteRequestId || !estimateId) {
    return NextResponse.json(
      { error: "Missing identifiers." },
      { status: 400 },
    );
  }

  const sb = createServiceRoleClient();
  const { data: row, error } = await sb
    .from("dispatch_estimates")
    .select(
      "id, quote_request_id, preview_html, preview_subject, preview_to, preview_from, preview_reply_to, preview_built_at, sent_at",
    )
    .eq("id", estimateId)
    .eq("quote_request_id", quoteRequestId)
    .maybeSingle<EstimateEmailRow>();
  if (error) {
    return NextResponse.json(
      { error: `Estimate lookup failed: ${error.message}` },
      { status: 500 },
    );
  }
  if (!row || !row.preview_html) {
    return NextResponse.json(
      { error: "No email preview stored for this proposal." },
      { status: 404 },
    );
  }

  // Wrap the persisted preview_html in a thin operator-facing header
  // strip so dispatch sees the From / To / Subject / Sent-at context that
  // a real inbox would have shown the recipient. The persisted HTML
  // body sits underneath, byte-identical to what was delivered.
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
<title>Range proposal email — ${subject}</title>
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
