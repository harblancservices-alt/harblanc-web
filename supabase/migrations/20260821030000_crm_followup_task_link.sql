-- 20260821030000_crm_followup_task_link.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes a real gap: setting a follow-up date (crm_contacts.next_followup_at
-- from the Add/Edit Contact form, or crm_calls.followup_required/reminder_at
-- from Log Call) saved a value but never created a crm_tasks row — so it
-- never showed up on the real Tasks page or the dashboard's open-tasks
-- query, only in a separate ad-hoc "Follow-ups Due" list the dashboard reads
-- directly off crm_contacts.next_followup_at with no complete/reopen action
-- of its own.
--
-- followup_task_id tracks which real crm_tasks row currently represents a
-- given contact's follow-up (or a given call's), so re-setting the date
-- updates that SAME task's due_at instead of spawning a duplicate every
-- time someone edits the contact, and clearing the date soft-deletes it
-- (only while still open — a follow-up the rep already completed is never
-- touched). Nullable, on delete set null (losing the task pointer if the
-- task itself is ever hard-deleted elsewhere shouldn't cascade into losing
-- the contact/call row).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_contacts
  add column if not exists followup_task_id uuid references public.crm_tasks(id) on delete set null;

alter table public.crm_calls
  add column if not exists followup_task_id uuid references public.crm_tasks(id) on delete set null;
