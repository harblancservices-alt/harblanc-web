# OTR entries → unassigned companies (2026-08-26)

Applied to production on 2026-08-26. `convert.sql` is the script that ran;
`rollback.sql` undoes it.

## The decision

Brent's framing: **the review isn't a stage before assignment — deciding who to
assign it to IS the review.** Research happens after the work reaches the agent.

So OTR has no research stage and no approval gate. An entry becomes an
unassigned company the moment it's created, landing straight in Admin →
Overview's "work to assign" pool. The status machine, the approval step and the
OTR Center page all go.

Nothing new had to be invented for the ongoing path: `releaseOtrEntry()` already
built exactly this end state, so the app-side change was re-timing that logic to
creation rather than writing it fresh.

## Before → after

| | Before | After |
|---|---|---|
| Live companies | 61 | 98 |
| Unassigned companies | 16 | 53 |
| Assign pool — prospects | 4 | 41 |
| Assign pool — OTR items | 38 | 1 (BETCO, see below) |
| Assign pool — BOL items | 0 | 0 |
| OTR entries at `new` | 38 | 1 |
| OTR entries at `rejected` | 3 | 3 (untouched) |

37 accounts created, 37 activities logged, 37 entries marked — all four counts
agreed in one statement.

**A note on the expected numbers.** The brief predicted the unassigned count
going 28 → 66. The real figures are 16 → 53. Two reasons: the pre-existing
unassigned count was 16, not 28 (companies were assigned between the scoping
query and this run), and 37 converted rather than 38 because BETCO was skipped.
The **pool total** barely moves — 42 → 42 — because the 37 leave it as OTR items
and re-enter it as companies. This migration changes what the pool is made of,
not how big it is.

## Two deliberate departures from the app's release path

**1. No `lifecycle_changed` activity.** The app's `releaseOtrEntry` calls
`promoteAccountToProspect`, which logs `lifecycle_changed` — and that kind is in
`CRM_CONTACT_ACTIVITY_KINDS`. Replicating it would have stamped all 37 companies
as "last contacted today" and poisoned the hot/cold scale these records are about
to feed. Only `account_created` was logged, which is deliberately not a contact
kind. Verified after the fact: 0 contact-kind activities written, 0 companies
reading as contacted.

**2. `released_by_user_id` stays NULL.** No person released these; a migration
converted them. The null is the honest record and doubles as a second way to
identify the batch.

## What was skipped, and why

**BETCO Scaffolds** (`d8f72d52-0601-4585-8f7e-0c706f03b3d9`) — its entry is
untouched and still at `new`. It normalizes to the same name as two existing
accounts:

- `Betco Scaffold` — unassigned
- `Betco Scaffold San Antonio` — assigned to `55c8019e-942b-4e1b-87e6-d517aff895f1`

Two rows already exist, which suggests the second is a location rather than a
separate company; converting blindly would have made a third. Merging or
duplicating on a guess is worse than leaving it.

Its research text, so it can be judged without the retired page:

> [Fit 9/10] DOT 36347. Intrastate-only authority but services OK/LA/AL/MS/FL —
> every out-of-state move must be hired out. Strong hotshot fit.
>
> DFW, TX · Scaffolding · sales relevance: high

**The 3 rejected entries** — Balon Corporation, Blue Origin, Wisenbaker Builder
Services. Deliberately declined; converting one would quietly reverse that.

## Data fidelity

`sales_relevance` (high/medium/low) has no column on `crm_accounts` and was not
migrated as a field — but no information is lost: every entry's notes already
open with the `[Fit N/10]` score that relevance was derived from, and the notes
carry over verbatim into `context_notes`. The column also still exists on the
untouched source rows.

Verified after conversion: 0 companies missing location, 0 missing notes, 37
distinct names (no duplicates created).

## Rolling back

`rollback.sql` finds the batch by the marker on the logged activity
(`meta->>'migration' = 'otr_to_unassigned_2026_08_26'`), not by a timestamp
window and not by `source='otr'` — because the app now creates `source='otr'`
companies too, and those must not be caught.

It only reverts companies **nobody has touched since**: still unassigned, with no
contacts, calls, tasks, deals or extra activity. Anything somebody has started
working is left alone and reported by the verification query at the end. Undo
should not throw away real work.

## Why the source table is still here

`crm_otr_entries` keeps every row and every column. Converted rows only gained a
pointer to the company they became. That is what makes the rollback exact, and it
is the reason the table was not dropped along with the page.
