-- "What done looks like" on a task (Brent, 2026-08-26).
--
-- One line stating the OUTCOME the task is asking for — "got a rate",
-- "confirmed they're still shipping" — as opposed to `title`, which states
-- the action, and `notes`, which carries the brief.
--
-- It pairs with the completion note the close-out standard will require:
-- the task states the goal up front, the note states what actually happened.
-- Without it, "did this get done properly?" has no stated bar to check
-- against, only somebody's memory of what they meant when they assigned it.
--
-- THE ONLY NEW COLUMN this composer needed. The other three fields already
-- had homes and are reused rather than duplicated:
--   instructions -> crm_tasks.notes      (text, nullable, already the brief)
--   contact      -> crm_tasks.contact_id (uuid, nullable, already exists)
--   priority     -> crm_tasks.priority   (text, not null, default 'normal';
--                                         vocabulary low/normal/high already
--                                         lives in tasks/priority.ts — the
--                                         composer simply offers two of them)
--
-- ADDITIVE ONLY. No existing column is altered, nothing is backfilled, and no
-- existing row changes meaning: every task that already exists gets null,
-- which reads as "no stated outcome" — exactly true of every task written
-- before today. Nullable rather than NOT NULL so the add is a pure catalog
-- change with no table rewrite.
--
-- Inherits crm_tasks' existing RLS unchanged; no policy is added or altered.

alter table public.crm_tasks
  add column if not exists definition_of_done text;

comment on column public.crm_tasks.definition_of_done is
  'One line describing the outcome that means this task is done (e.g. "got a rate"). Null means no stated bar. Distinct from title (the action) and notes (the brief).';
