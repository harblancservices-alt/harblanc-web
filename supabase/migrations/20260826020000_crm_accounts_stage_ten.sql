-- Ten-stage company lifecycle: the two columns it needs.
--
-- Brent's stage set replaces the old six with ten:
--   New Lead · Qualified · Contacted · Engaged · Quoting · Setup
--   Active · Dormant · Lost · Disqualified
--
-- ADDITIVE AND NULLABLE ONLY. No existing column is altered and no existing
-- row is touched. The data remap of lifecycle_status is deliberately NOT in
-- this migration -- it changes what Brent sees on 99 records and is held for
-- his approval. Everything here is safe to apply before that decision, and
-- safe to leave applied if he rejects the remap.
--
-- NO CHECK CONSTRAINT TO WIDEN. lifecycle_status is plain nullable text with
-- no constraint (verified on this database: crm_accounts carries only
-- crm_accounts_fit_rating_range and crm_accounts_prospect_level_range). The
-- vocabulary is enforced in accounts/lifecycle.ts, where normalizeStage()
-- funnels every stored value -- including ones from earlier vocabularies --
-- onto a known stage. That is what makes a stage rename survivable without a
-- lock-step data migration, and it is why nothing here adds a constraint that
-- would take that property away.

-- When the company last CHANGED stage. Distinct from updated_at, which moves
-- on any edit: this answers "how long has it been sitting where it is",
-- which is the question the staleness clocks and the pipeline board ask.
-- Nullable because it is genuinely unknown for every row that predates it --
-- backfilling it from updated_at or created_at would invent a fact.
alter table crm_accounts
  add column if not exists stage_changed_at timestamptz;

-- Why a company was Lost or Disqualified. Required by the UI before either
-- of those two stages can be committed, but nullable in the schema: every
-- company already at 'lost' predates the rule, and a NOT NULL would either
-- reject those rows or force a made-up reason onto them.
--
-- NOT reusing crm_deals.lost_reason: that is a column on a DEAL, a different
-- entity, in a table this app has never read or written (its sibling
-- crm_pipeline_stages holds a dormant 7-stage vocabulary from an abandoned
-- deals model). Borrowing it would tie the company lifecycle to a schema
-- nothing maintains.
alter table crm_accounts
  add column if not exists stage_loss_reason text;

comment on column crm_accounts.stage_changed_at is
  'When lifecycle_status last changed. NULL means unknown (predates the column).';
comment on column crm_accounts.stage_loss_reason is
  'Why the company was moved to Lost or Disqualified. Required by the UI for those two stages; nullable because pre-existing lost rows have no recorded reason.';
