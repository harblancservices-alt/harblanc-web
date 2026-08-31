-- The star: "this person actually gets freight moved."
--
-- WHAT IT IS NOT. It is not seniority and it is not a favourite. Brent,
-- 2026-08-31: "it's hard to know who's the real boss at these places. Jeff
-- might be the owner but Rodger might be the shipper guy, so Jeff doesn't
-- care about Rodger's job — so Rodger needs the star, not Jeff." The whole
-- value is that it disagrees with the org chart.
--
-- WHY TWO NULLABLE COLUMNS AND NOT A BOOLEAN. Starred is `starred_at IS NOT
-- NULL`, so the flag and its date are one fact rather than two that can
-- contradict each other — there is no way to be starred with no date, or
-- dated with no star. Both nullable and additive: every existing row is
-- unstarred without a backfill, and nothing that selects * changes shape.
--
-- The provenance is the point over time. The intended use is a thousand
-- calls producing fifty people worth keeping, and in a year "who decided
-- this and when" is the difference between an asset and a list nobody
-- trusts. starred_by is deliberately NOT a foreign key with a cascade: if a
-- profile is ever removed we want the star to survive with a dangling id
-- rather than silently un-starring somebody's work.

alter table public.crm_contacts
  add column if not exists starred_at timestamptz,
  add column if not exists starred_by uuid;

comment on column public.crm_contacts.starred_at is
  'When this contact was starred as somebody who actually gets freight moved. NULL means not starred — this column IS the flag. Not seniority: the shipping clerk outranks the owner here.';

comment on column public.crm_contacts.starred_by is
  'crm_profiles.id of whoever starred it. No FK on purpose — a removed profile must not un-star anybody.';

-- The Favourites view reads "every starred contact, newest star first",
-- across companies. Partial, so it indexes the fifty rows that matter
-- rather than all eighty-plus and every unstarred row added after.
create index if not exists crm_contacts_starred_idx
  on public.crm_contacts (org_id, starred_at desc)
  where starred_at is not null and deleted_at is null;
