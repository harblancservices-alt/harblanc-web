# HARBLANC Stability + Deploy Checklist

**Audience:** Brent. Single-operator deploy reality. The point of this checklist is to keep the production and local Supabase schemas in lockstep, catch missing env vars before they bite, and prove the workflow still works end-to-end after every meaningful change.

Run this before pushing to main. Run it again after deploy. Five minutes total.

---

## 1. Pre-push (local)

- [ ] `npm run lint` — clean
- [ ] `npm run typecheck` — clean
- [ ] `npm run build` — succeeds (catches Vercel-only errors that `dev` hides)
- [ ] `git status` — every file you expect to push is staged; nothing surprising

## 2. Schema state

- [ ] Compare `supabase/migrations/` against what's applied on Supabase. Either:
  - `supabase db push` (CLI), OR
  - copy the latest migration into the Supabase SQL editor and run it
- [ ] Run a smoke query in the Supabase SQL editor:
  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public'
  order by table_name;
  ```
  Expected core tables (Phase 5D state):
  - `applications`, `applications` trash columns
  - `quote_requests` (with `assigned_dispatcher`, `assigned_carrier`, `assigned_truck`, `trailer_type`)
  - `dispatch_estimates`, `shipment_intake`
  - `finalized_quotes`
  - `bills_of_lading`
  - `dispatch_events`, `generated_quotes`
- [ ] Confirm sequences exist:
  ```sql
  select sequence_name from information_schema.sequences where sequence_schema = 'public';
  ```
  Expected: `generated_quotes_number_seq`, `finalized_quotes_number_seq`, `bills_of_lading_number_seq`

## 3. Env vars

Vercel project → Settings → Environment Variables. Confirm both Preview and Production have:

**Required (app won't function without these):**
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

**Operational (degrades flows when missing):**
- [ ] `RESEND_API_KEY` — emails (estimates, finalized quotes, BOLs)
- [ ] `RESEND_FROM_ADDRESS` — deliverability
- [ ] `DISPATCH_EMAIL` — reply-to override
- [ ] `NEXT_PUBLIC_SITE_URL` — accept/decline link host, logo asset host

The admin dashboard renders an amber banner if any required or operational var is missing. If you see it post-deploy, fix the env in Vercel and redeploy.

## 4. Smoke test in production

After deploy, open production in an incognito window and confirm:

- [ ] `https://www.harblancservices.com/` loads (homepage)
- [ ] `https://www.harblancservices.com/quote` loads (Quick Quote form)
- [ ] `https://www.harblancservices.com/admin/login` loads
- [ ] You can log in
- [ ] Admin dashboard renders without the env-issue banner
- [ ] At least one existing lead opens cleanly at `/admin/quotes/[id]`

## 5. End-to-end real shipment test

The full operational test lives in `docs/testing-checklist.md`. After any change that touches the workflow code (server actions, document renderers, status transitions), run that checklist against a throwaway lead before considering the deploy good.

## 6. Rollback path

- [ ] You know which Vercel deployment to "Promote to Production" if the new one is broken
- [ ] You know which Supabase migration to revert (or how to write the inverse migration) if a schema change is bad

Migrations are the harder direction — they don't auto-rollback. If a migration breaks production:

1. Promote the previous Vercel deploy immediately (restores the old code)
2. Write a reverse migration and push it
3. Investigate the bad migration locally

## 7. Known operational gotchas

- **Windows mount truncation** — Edit/Write on the local development machine occasionally truncates files mid-content. After heavy edits, sanity-check large files with:
  ```bash
  tail -c 50 path/to/file.tsx | od -An -c
  ```
  The file should end with the expected closing token (`}\n`, `;\n }\n`, etc.).
- **Supabase auth keys** — new `sb_publishable_` / `sb_secret_` keys still map to anon / service_role respectively. The `Prefer: return=representation` header needs a SELECT policy or you'll get 42501 errors.
- **Resend onboarding fallback** — if `RESEND_FROM_ADDRESS` is unset, emails ship from `onboarding@resend.dev`. Customers will see that sender and may flag the email as spam. Always set this in production.
- **CHECK constraint extension** — the `quote_requests_lead_status_check` constraint needs to be dropped and recreated when adding new statuses (already done through Phase 5B; future status additions follow the same pattern).
