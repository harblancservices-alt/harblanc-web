-- 20260556000000_reach_drop_signoff_name.sql
-- The branded signature footer already says HARBLANC / Brent Harbaugh, so the
-- template's "Thanks,\nHARBLANC" closing read the name twice. Drop the trailing
-- "\nHARBLANC" line from all six templates — they now close with just "Thanks,".
-- Idempotent: sets each row to its final desired copy.

update public.reach_templates set
  subject = 'Hotshot Capacity — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Opening Up {town_paren} with Capacity Ready to Move. What do you have coming out of the area?\n\nHappy to take a look — just reply or give me a call.\n\nThanks,',
  updated_at = now()
where posture = 'available' and leverage = 'confident';

update public.reach_templates set
  subject = 'Hotshot Available — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Available and Ready to Roll {town_paren}. If you''ve got Freight coming out of the area, send it my way and I''ll get you a Number — fast.\n\nThanks,',
  updated_at = now()
where posture = 'available' and leverage = 'balanced';

update public.reach_templates set
  subject = 'Ready to Load — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Ready to Load Now {town_paren}. What are you paying out of the area? Send me your Best Lanes and I''ll Book Today.\n\nThanks,',
  updated_at = now()
where posture = 'available' and leverage = 'push';

update public.reach_templates set
  subject = 'Hotshot Headed to {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Headed Your Way {town_paren} with Capacity Opening Up shortly. What do you typically move out of the area?\n\nReply or give me a call.\n\nThanks,',
  updated_at = now()
where posture = 'planning' and leverage = 'confident';

update public.reach_templates set
  subject = 'Hotshot Inbound — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Inbound {town_paren} and will be Open for a Reload. If you''ve got Freight heading out of the area, send it over and I''ll get you a Rate.\n\nThanks,',
  updated_at = now()
where posture = 'planning' and leverage = 'balanced';

update public.reach_templates set
  subject = 'Reload Needed — {market}',
  body = E'Hi {broker},\n\nHARBLANC has a {equipment} Inbound {town_paren} and needs a Reload. What are you paying on lanes out of the area? Send your Best and I''ll Lock It In.\n\nThanks,',
  updated_at = now()
where posture = 'planning' and leverage = 'push';
