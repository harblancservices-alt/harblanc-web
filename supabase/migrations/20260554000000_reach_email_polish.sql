-- 20260554000000_reach_email_polish.sql
-- Reach email polish from Brent's testing. Additive + idempotent; no data lost.
--
--   1. reach_settings.mc / .phone — the MC number + phone shown in every email
--      signature, pre-filled with Brent's real values and editable in Setup.
--   2. Rewrites all six posture×style templates to punchier, scannable copy with
--      strategic Capitalization (equipment / availability / "Ready to Roll"),
--      the MC+phone signature ({mc}/{phone} tokens), and the compact
--      "(39 mi W of Indianapolis, IN)" location via {town_paren}. Never says the
--      truck is "empty". Keeps the per-broker "Hi {broker}," greeting.
--      The leverage VALUES (confident/balanced/push) are unchanged — only the
--      operator-facing labels are Low-key / Standard / Eager.

-- ── 1. Signature columns ──────────────────────────────────────────────────────
alter table public.reach_settings
  add column if not exists mc text not null default '146-7901';
alter table public.reach_settings
  add column if not exists phone text not null default '832-445-8775';

-- Backfill the singleton if the columns pre-existed empty.
update public.reach_settings
  set mc = coalesce(nullif(btrim(mc), ''), '146-7901'),
      phone = coalesce(nullif(btrim(phone), ''), '832-445-8775'),
      updated_at = now()
  where id = true;

-- ── 2. Rewrite the six templates ──────────────────────────────────────────────
-- Available (truck open now → market = last drop).
update public.reach_templates set
  subject = 'Hotshot Capacity — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Opening Up {town_paren} with Capacity Ready to Move. What do you have coming out of the area?\n\nHappy to take a look — just reply or give me a call.\n\nThanks,\nHARBLANC\nMC {mc} · {phone}',
  updated_at = now()
where posture = 'available' and leverage = 'confident';

update public.reach_templates set
  subject = 'Hotshot Available — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Available and Ready to Roll {town_paren}. If you''ve got Freight coming out of the area, send it my way and I''ll get you a Number — fast.\n\nThanks,\nHARBLANC\nMC {mc} · {phone}',
  updated_at = now()
where posture = 'available' and leverage = 'balanced';

update public.reach_templates set
  subject = 'Ready to Load — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Ready to Load Now {town_paren}. What are you paying out of the area? Send me your Best Lanes and I''ll Book Today.\n\nThanks,\nHARBLANC\nMC {mc} · {phone}',
  updated_at = now()
where posture = 'available' and leverage = 'push';

-- Planning (a load in transit → market = its destination).
update public.reach_templates set
  subject = 'Hotshot Headed to {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Headed Your Way {town_paren} with Capacity Opening Up shortly. What do you typically move out of the area?\n\nReply or give me a call.\n\nThanks,\nHARBLANC\nMC {mc} · {phone}',
  updated_at = now()
where posture = 'planning' and leverage = 'confident';

update public.reach_templates set
  subject = 'Hotshot Inbound — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Inbound {town_paren} and will be Open for a Reload. If you''ve got Freight heading out of the area, send it over and I''ll get you a Rate.\n\nThanks,\nHARBLANC\nMC {mc} · {phone}',
  updated_at = now()
where posture = 'planning' and leverage = 'balanced';

update public.reach_templates set
  subject = 'Reload Needed — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Inbound {town_paren} and needs a Reload. What are you paying on lanes out of the area? Send your Best and I''ll Lock It In.\n\nThanks,\nHARBLANC\nMC {mc} · {phone}',
  updated_at = now()
where posture = 'planning' and leverage = 'push';
