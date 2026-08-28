-- APPLIED to production 2026-08-28; this file is the tracked record.
--
-- A logged call can now be corrected (calls/actions.ts::updateCall), and the
-- history has to stay honest about it: a reader needs to know a write-up was
-- changed after the fact, or the record quietly becomes unreliable.
--
-- updated_at cannot carry that meaning. The follow-up-task wiring writes to
-- crm_calls immediately after insert, so 3 of the 59 existing calls already
-- had updated_at > created_at with nobody having edited anything. Using it
-- would have branded real, untouched records as edited.
--
-- One nullable column. NULL means "never edited", which is true of every
-- existing row, so nothing is backfilled and nothing changes meaning.
alter table crm_calls
  add column if not exists summary_edited_at timestamptz;

comment on column crm_calls.summary_edited_at is
  'When the write-up was last corrected via updateCall. NULL = never edited. Distinct from updated_at, which the follow-up-task wiring also bumps.';
