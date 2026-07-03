-- 20260551000000_reach.sql
-- "Backhaul Reach" — near-zero-typing, market-aware broker outreach that
-- replaces the old backhaul compose flow (the broker farming/contacts stay).
--
-- Four tables, all service-role only (RLS on, no policy = deny all to
-- anon/auth, matching brokers / broker_contacts / loads / email_presets).
-- IF NOT EXISTS everywhere so this is idempotent against the live DB, which is
-- migrated separately.
--
--   reach_markets    — the freight MARKETS brokers recognize ("Houston, TX
--                      area"). A town/zip resolves to the nearest market inside
--                      its radius; the email names the market, never the town.
--                      `wording` is the exact phrase dropped into the email.
--   reach_settings   — singleton (id=true, mirrors dispatch_settings): the
--                      truck line, reply-to name, the show-exact-town toggle,
--                      and the default leverage dial.
--   reach_templates  — the two postures (available / planning) × three leverage
--                      variants (confident / balanced / push). Subject + body
--                      with {broker}/{market}/{equipment}/{town_paren} tokens.
--   reach_sends      — one row per personalized send, for suppression
--                      ("reached Nd ago") + the recipient hold-back logic.

-- ── reach_markets ─────────────────────────────────────────────────────────────
create table if not exists public.reach_markets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  -- Exact phrase used in emails. Usually equals name, but editable so Brent can
  -- tune the wording ("the Houston market" vs "Houston, TX area") separately.
  wording text not null default '',
  center_zip text,
  center_lat double precision,
  center_lon double precision,
  radius_mi integer not null default 150,
  -- Free-text list of towns/notes the market covers (Kingwood, Conroe, …).
  towns text,
  notes text,
  sort_order integer not null default 0,
  deleted_at timestamptz
);

alter table public.reach_markets enable row level security;

create index if not exists reach_markets_sort_idx
  on public.reach_markets (sort_order, created_at)
  where deleted_at is null;

-- ── reach_settings (singleton) ───────────────────────────────────────────────
create table if not exists public.reach_settings (
  -- Single shared row, matching dispatch_settings' id=true pattern.
  id boolean primary key default true,
  truck_line text not null default '40'' gooseneck hotshot, dually',
  reply_to_name text not null default 'HARBLANC',
  show_exact_town boolean not null default true,
  default_leverage text not null default 'confident',
  updated_at timestamptz not null default now(),
  constraint reach_settings_singleton check (id)
);

alter table public.reach_settings enable row level security;

insert into public.reach_settings (id)
values (true)
on conflict (id) do nothing;

-- ── reach_templates ──────────────────────────────────────────────────────────
create table if not exists public.reach_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 'available' (truck delivered / no active load → market = last drop) or
  -- 'planning' (a load in transit → market = its destination).
  posture text not null,
  -- 'confident' (vague, protects rate — default) | 'balanced' | 'push'.
  leverage text not null,
  subject text not null default '',
  body text not null default ''
);

alter table public.reach_templates enable row level security;

create unique index if not exists reach_templates_posture_leverage_idx
  on public.reach_templates (posture, leverage);

-- ── reach_sends (suppression log) ────────────────────────────────────────────
create table if not exists public.reach_sends (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references public.brokers(id) on delete set null,
  broker_contact_id uuid,
  email text not null,
  market_id uuid references public.reach_markets(id) on delete set null,
  -- Snapshot of the market name at send time (survives market rename/delete).
  market_name text,
  posture text,
  leverage text,
  sent_at timestamptz not null default now()
);

alter table public.reach_sends enable row level security;

create index if not exists reach_sends_broker_idx
  on public.reach_sends (broker_id, sent_at desc);
create index if not exists reach_sends_email_idx
  on public.reach_sends (lower(email), sent_at desc);

-- ── Seed markets ─────────────────────────────────────────────────────────────
-- Lat/long derived from the bundled `zipcodes` dataset (the same source the
-- farm-contact city typeahead uses) for each market's representative downtown
-- ZIP. No-op once any market exists, so re-running never duplicates or clobbers
-- Brent's edits.
insert into public.reach_markets
  (name, wording, center_zip, center_lat, center_lon, radius_mi, towns, sort_order)
select v.name, v.wording, v.center_zip, v.center_lat, v.center_lon, v.radius_mi, v.towns, v.sort_order
from (
  values
    ('Houston, TX area',  'Houston, TX area',  '77002', 29.7594, -95.3594, 150,
      'Houston, Kingwood, Conroe, Baytown, Katy, Pasadena, The Woodlands', 0),
    ('Dallas–Fort Worth area', 'the DFW area',  '75201', 32.7904, -96.8044, 150,
      'Dallas, Fort Worth, Arlington, Irving, Denton, Plano', 1),
    ('Jackson, MS area',  'the Jackson, MS area', '39201', 32.2935, -90.1867, 120,
      'Jackson, Pearl, Clinton, Ridgeland, Brandon', 2),
    ('Atlanta, GA area',  'the Atlanta, GA area', '30303', 33.7525, -84.3888, 150,
      'Atlanta, Marietta, Decatur, Sandy Springs, Lawrenceville', 3)
) as v(name, wording, center_zip, center_lat, center_lon, radius_mi, towns, sort_order)
where not exists (select 1 from public.reach_markets);

-- ── Seed templates (2 postures × 3 leverage = 6) ─────────────────────────────
-- Leverage-safe wording: never the word "empty"; leads with capability; asks
-- about the broker's freight. At 'confident' no rate and no deadline are stated
-- (protects the rate). Tokens: {broker} {market} {equipment} {town_paren}
-- ({town_paren} renders "(Kingwood, 22 mi NE)" or "" when the toggle is off;
-- surrounding whitespace is collapsed at render time).
insert into public.reach_templates (posture, leverage, subject, body)
select v.posture, v.leverage, v.subject, v.body
from (
  values
    -- Available (truck delivered / no active load → market = last drop)
    ('available', 'confident',
      'Hotshot capacity in {market}',
      E'Hi {broker},\n\nHARBLANC is running a {equipment} in {market} {town_paren} with capacity opening up. What do you have moving out of the area?\n\nHappy to take a look — reply here or give me a call.\n\nThanks,\nHARBLANC'),
    ('available', 'balanced',
      'Hotshot available — {market}',
      E'Hi {broker},\n\nHARBLANC has a {equipment} available in {market} {town_paren} and ready to roll. If you''ve got freight coming out of there, send it my way and I''ll get you a number.\n\nThanks,\nHARBLANC'),
    ('available', 'push',
      'Ready to load out of {market}',
      E'Hi {broker},\n\nHARBLANC has a {equipment} in {market} {town_paren}, ready to load now. What are you paying out of the area? Send me your best lanes and I''ll book today.\n\nThanks,\nHARBLANC'),
    -- Planning (a load in transit → market = its destination)
    ('planning', 'confident',
      'Hotshot headed to {market}',
      E'Hi {broker},\n\nHARBLANC has a {equipment} headed into {market} {town_paren} with capacity opening up there shortly. What do you typically move out of the area?\n\nReply here or give me a call.\n\nThanks,\nHARBLANC'),
    ('planning', 'balanced',
      'Hotshot inbound to {market}',
      E'Hi {broker},\n\nHARBLANC is bringing a {equipment} into {market} {town_paren} and will be open for a reload. If you''ve got freight heading out of there, send it over and I''ll get you a rate.\n\nThanks,\nHARBLANC'),
    ('planning', 'push',
      'Reload out of {market} — hotshot inbound',
      E'Hi {broker},\n\nHARBLANC has a {equipment} inbound to {market} {town_paren} and needs a reload. What are you paying on lanes out of the area? Send your best and I''ll lock it in.\n\nThanks,\nHARBLANC')
) as v(posture, leverage, subject, body)
where not exists (select 1 from public.reach_templates);
