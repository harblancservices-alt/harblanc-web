-- Research marks: what a person did with each guess the app offered.
--
-- WHY A COLUMN AND NOT A TABLE. One small object per company, read on every
-- render of that company's file and written only when somebody presses Yes
-- or No. There is no query that asks "every dismissal across the org", no
-- foreign key wanted, and no history to keep beyond the current answer — the
-- audit trail already lives in crm_activities, which is where the accepted
-- value and its basis are logged. A table would add a join to a hot read for
-- nothing.
--
-- SHAPE, keyed by the guess field:
--   {
--     "industry": { "state": "accepted",  "value": "Waterworks distribution",
--                   "basis": "9 other branches ...", "at": "2026-08-31T...",
--                   "by": "<user uuid>" },
--     "website":  { "state": "dismissed", "at": "...", "by": "<user uuid>" }
--   }
--
-- `state` is the only field read as control flow: anything present at all
-- stops that guess being offered again, which is the whole point — a person
-- who has said no must not be asked a second time.
--
-- `basis` is kept on ACCEPTED marks deliberately. It records that the value
-- came from an inference somebody agreed with rather than from a fact
-- somebody confirmed, which is the same honesty rule the BOL provenance
-- pills follow ("possible shipper", never "shipper"). Six months from now
-- the difference between "we read this off a sister branch" and "they told
-- us on the phone" still matters.

alter table public.crm_accounts
  add column if not exists research_marks jsonb not null default '{}'::jsonb;

comment on column public.crm_accounts.research_marks is
  'Per-field record of guesses the research panel offered: accepted (with the value and the basis it was inferred from) or dismissed. Presence of a key stops that guess being offered again. Written only by accounts/[id]/research-actions.ts.';
