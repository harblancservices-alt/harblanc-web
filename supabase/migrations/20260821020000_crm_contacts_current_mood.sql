-- 20260821020000_crm_contacts_current_mood.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a "current mood" field to crm_contacts — a single-select read on where
-- a contact stands right now (Interested / Not Interested / Call Back / No /
-- Warm / Hot / Cold), set from the Add Contact form and changeable afterward
-- from the contact's own display (not a one-time set-and-forget field).
-- Nullable — most existing contacts have no mood recorded yet, which is a
-- valid state (no badge shown), not an error.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.crm_contacts
  add column if not exists current_mood text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_contacts_current_mood_check'
  ) then
    alter table public.crm_contacts
      add constraint crm_contacts_current_mood_check
      check (current_mood is null or current_mood in (
        'interested', 'not_interested', 'call_back', 'no', 'warm', 'hot', 'cold'
      ));
  end if;
end;
$$;
