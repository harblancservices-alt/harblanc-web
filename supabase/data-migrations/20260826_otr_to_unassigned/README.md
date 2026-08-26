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
| Live companies | 61 | 99 |
| Unassigned companies | 16 | 54 |
| Assign pool — prospects | 4 | 42 |
| Assign pool — OTR items | 38 | 0 |
| Assign pool — BOL items | 0 | 0 |
| OTR entries at `new` | 38 | 0 |
| OTR entries at `rejected` | 3 | 3 (untouched) |

38 accounts created, 38 activities logged, 38 entries marked. It ran in two
passes: 37 first, then BETCO Scaffolds once Brent ruled that duplicates should
be labelled rather than skipped. Every pass agreed across all four counts.

**A note on the expected numbers.** The brief predicted the unassigned count
going 28 → 66. The real figures are **16 → 54**: the pre-existing unassigned
count was 16, not 28, because companies were assigned between the scoping query
and the run.

The **pool total does not move at all** — 42 → 42 — because the 38 leave it as
OTR items and re-enter it as companies. That is the number worth understanding:
this migration changed what the pool is made of, not how big it is.

## Two deliberate departures from the app's release path

**1. No `lifecycle_changed` activity.** The app's `releaseOtrEntry` calls
`promoteAccountToProspect`, which logs `lifecycle_changed` — and that kind is in
`CRM_CONTACT_ACTIVITY_KINDS`. Replicating it would have stamped all 38 companies
as "last contacted today" and poisoned the hot/cold scale these records are about
to feed. Only `account_created` was logged, which is deliberately not a contact
kind. Verified after the fact: 0 contact-kind activities written, 0 companies
reading as contacted.

**2. `released_by_user_id` stays NULL.** No person released these; a migration
converted them. The null is the honest record and doubles as a second way to
identify the batch.

## Duplicates are labelled, not skipped

**BETCO Scaffolds** was held back on the first pass because it normalizes to
the same name as two existing accounts (`Betco Scaffold`, unassigned, and
`Betco Scaffold San Antonio`, assigned). Brent's ruling later the same day:
converting must not be blocked on a name collision. Create it anyway and show
it as a duplicate so he can deal with it himself.

So it converted with the rest, and the work pool's **Type** column now reads
"Duplicate" on it, naming what it collides with on hover. **1 of the 38 comes
through flagged** — checked against all 99 live companies, with no false
positives.

The rule (`admin/duplicates.ts`) is DERIVED AT READ TIME, never stored, the
same call as the completeness gaps: a duplicate is a fact about what the table
currently holds, not a property of a row, and a stored flag would be silently
falsified by the next rename or merge. Names are lowercased, stripped of legal
form and punctuation, and de-pluralised; two companies match on an equal key,
or on one key being a prefix of the other above a length floor. The prefix arm
is what catches a second LOCATION of a company already in the book — exactly
the San Antonio row.

**The 3 rejected entries** — Balon Corporation, Blue Origin, Wisenbaker Builder
Services — were left alone throughout. Deliberately declined; converting one
would quietly reverse that.

## Data fidelity

`sales_relevance` (high/medium/low) has no column on `crm_accounts` and was not
migrated as a field — but no information is lost: every entry's notes already
open with the `[Fit N/10]` score that relevance was derived from, and the notes
carry over verbatim into `context_notes`. The column also still exists on the
untouched source rows.

Verified after conversion: 0 companies missing location, 0 missing notes.

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
