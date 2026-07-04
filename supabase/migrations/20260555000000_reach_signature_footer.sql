-- 20260555000000_reach_signature_footer.sql
-- Branded signature footer + reply-to for Reach emails. Additive + idempotent.
--
--   1. reach_settings.reply_to_email — where broker replies land, set on every
--      send (real + test). Default Dispatch@Harblancservices.com; editable in
--      Setup.
--   2. Drops the plain "MC {mc} · {phone}" sign-off line from all six templates.
--      The branded signature footer (logo with DOT 3918509 | MC 1467901, plus
--      Brent Harbaugh / President / phone / emails) is now appended to every
--      email by the HTML wrapper + plain-text fallback, so the inline line would
--      just duplicate it. Punchy copy and Capitalization are unchanged.
--
-- These UPDATEs set the templates to their final desired copy regardless of
-- whether 20260554 was applied, so it's safe either way.

-- ── 1. Reply-to column ────────────────────────────────────────────────────────
alter table public.reach_settings
  add column if not exists reply_to_email text not null
  default 'Dispatch@Harblancservices.com';

update public.reach_settings
  set reply_to_email =
        coalesce(nullif(btrim(reply_to_email), ''), 'Dispatch@Harblancservices.com'),
      updated_at = now()
  where id = true;

-- ── 2. Templates without the inline MC/phone line ─────────────────────────────
update public.reach_templates set
  subject = 'Hotshot Capacity — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Opening Up {town_paren} with Capacity Ready to Move. What do you have coming out of the area?\n\nHappy to take a look — just reply or give me a call.\n\nThanks,\nHARBLANC',
  updated_at = now()
where posture = 'available' and leverage = 'confident';

update public.reach_templates set
  subject = 'Hotshot Available — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Available and Ready to Roll {town_paren}. If you''ve got Freight coming out of the area, send it my way and I''ll get you a Number — fast.\n\nThanks,\nHARBLANC',
  updated_at = now()
where posture = 'available' and leverage = 'balanced';

update public.reach_templates set
  subject = 'Ready to Load — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Ready to Load Now {town_paren}. What are you paying out of the area? Send me your Best Lanes and I''ll Book Today.\n\nThanks,\nHARBLANC',
  updated_at = now()
where posture = 'available' and leverage = 'push';

update public.reach_templates set
  subject = 'Hotshot Headed to {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Headed Your Way {town_paren} with Capacity Opening Up shortly. What do you typically move out of the area?\n\nReply or give me a call.\n\nThanks,\nHARBLANC',
  updated_at = now()
where posture = 'planning' and leverage = 'confident';

update public.reach_templates set
  subject = 'Hotshot Inbound — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Inbound {town_paren} and will be Open for a Reload. If you''ve got Freight heading out of the area, send it over and I''ll get you a Rate.\n\nThanks,\nHARBLANC',
  updated_at = now()
where posture = 'planning' and leverage = 'balanced';

update public.reach_templates set
  subject = 'Reload Needed — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Inbound {town_paren} and needs a Reload. What are you paying on lanes out of the area? Send your Best and I''ll Lock It In.\n\nThanks,\nHARBLANC',
  updated_at = now()
where posture = 'planning' and leverage = 'push';
