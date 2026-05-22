-- 20260527000000_dispatch_estimates_preview_snapshot.sql
-- Quick Estimate workflow redesign — persistent preview + sent history.
--
-- The dispatch_estimates table already has the right shape for the new
-- workflow:
--
--   * ON DELETE CASCADE from quote_requests — established in
--     20260525000000_dispatch_workspace.sql, so permanently deleting a
--     quote also removes its estimate history. No schema change needed
--     for cascade.
--
--   * Partial unique index `dispatch_estimates_one_draft_per_request`
--     keyed on (quote_request_id) WHERE sent_at IS NULL — established
--     in the same migration. This keeps at most one draft per quote
--     while allowing as many sent (sent_at IS NOT NULL) rows as Brent
--     wants to send. No schema change needed for history.
--
-- What IS new in this migration:
--
--   1. Preview snapshot columns on dispatch_estimates. When Brent clicks
--      Build Preview, we render the email and persist subject / html /
--      text / preheader / to / from / reply_to on the draft row. That
--      way:
--        - Reloading the page restores the preview.
--        - Sending uses the *saved* preview bytes, not whatever the
--          form happens to hold at click time. preview-bytes ==
--          sent-bytes by construction.
--        - When the draft transitions to a sent record (sent_at filled),
--          those same preview columns become the historical record of
--          what the customer actually received — viewable from the
--          Sent Estimates list.
--
--   2. closing_line column — currently the resolved closing text is
--      only stored ephemerally in the FormData posted from the
--      composer. To round-trip the preview through DB and to keep
--      audit-friendly history, persist it on the row.

alter table public.dispatch_estimates
  add column if not exists preview_subject text,
  add column if not exists preview_preheader text,
  add column if not exists preview_html text,
  add column if not exists preview_text text,
  add column if not exists preview_to text,
  add column if not exists preview_from text,
  add column if not exists preview_reply_to text,
  add column if not exists preview_built_at timestamptz,
  add column if not exists closing_line text;

-- Useful for fetching sent history newest-first per quote.
create index if not exists dispatch_estimates_sent_idx
  on public.dispatch_estimates (quote_request_id, sent_at desc)
  where sent_at is not null;
