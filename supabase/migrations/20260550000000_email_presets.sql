-- 20260550000000_email_presets.sql
-- Editable email presets for the Backhaul compose box. Single-operator app,
-- so no per-user scoping — one shared set the owner edits. Repo record: the
-- remote DB is applied separately; IF NOT EXISTS keeps this idempotent.
--
-- email_presets — a named subject/body template. Bodies support the {broker}
--   token (filled per-recipient at send), plus {area}/{when} resolved from the
--   current search when a preset is loaded into the compose box. Seeded with
--   three starters.
--
-- Service-role only (admin server actions); RLS on with no policy = deny all
-- to anon/auth, matching brokers / loads.

create table if not exists public.email_presets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  deleted_at timestamptz
);

alter table public.email_presets enable row level security;

create index if not exists email_presets_sort_idx
  on public.email_presets (sort_order, created_at)
  where deleted_at is null;

-- Seed the three starter presets once. No-op if any preset already exists, so
-- re-running never duplicates and never clobbers Brent's edits.
insert into public.email_presets (name, subject, body, sort_order)
select v.name, v.subject, v.body, v.sort_order
from (
  values
    (
      'Empty truck / backhaul ask',
      'Hotshot empty {area} — available {when}',
      E'Hi {broker},\n\nHARBLANC has a hotshot sitting empty in {area}, ready {when} and willing to deadhead. Anything moving out of the area?\n\nReply to this email or call (xxx) xxx-xxxx.\n\nThanks,\nHARBLANC',
      0
    ),
    (
      'Rate inquiry',
      'Rate check — {area} outbound',
      E'Hi {broker},\n\nWhat are you paying on lanes out of {area} right now? HARBLANC runs a hotshot (dually + gooseneck) and can be flexible on a pickup around {when}.\n\nAppreciate any numbers you can share.\n\nThanks,\nHARBLANC',
      1
    ),
    (
      'New lane intro',
      'Introducing HARBLANC — hotshot capacity',
      E'Hi {broker},\n\nI''m reaching out to introduce HARBLANC — an owner-operated hotshot carrier (dually + 40'' gooseneck). We''re building steady lanes and would love to be on your list for freight, especially around {area}.\n\nHappy to send our MC/COI. What''s the best way to get set up?\n\nThanks,\nHARBLANC',
      2
    )
) as v(name, subject, body, sort_order)
where not exists (select 1 from public.email_presets);
