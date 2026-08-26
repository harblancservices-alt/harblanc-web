# PROPOSED: remap the old six stages onto the ten — NOT APPLIED

Awaiting Brent's approval. Nothing in this directory has been run.

The ten-stage vocabulary is already live and the app works correctly against
the current data, because `normalizeStage()` maps every old value onto a
current stage at read time. This remap is about what is *stored*, so the
database stops carrying a vocabulary nobody uses.

## The proposal

| Now | Rows | Becomes | |
|---|---|---|---|
| `new_lead` | 51 | **New Lead** | direct |
| `contacted` | 8 | **Contacted** | direct |
| `lost` | 5 | **Lost** | direct |
| `active_customer` | 1 | **Active** | rename |
| `researching` + has a logged call | 12 | **Contacted** | see below |
| `researching` + assigned, never called | 21 | **Qualified** | see below |
| `researching` + unassigned, never called | 1 | **New Lead** | see below |

99 rows, all accounted for. There are no `quoting` rows to map.

Resulting distribution: New Lead 52 · Qualified 21 · Contacted 20 · Active 1 ·
Lost 5 · Engaged, Quoting, Setup, Dormant, Disqualified 0.

## Where I disagree with the brief, and why

The brief called `researching` "the genuinely ambiguous one" and asked where
it should go. **It should not go anywhere as a single block — it is three
different situations wearing one label.**

`researching` was not usually chosen by a person. It was written
*automatically* by the claim path in `accounts/actions.ts`: assigning an
unowned company advanced `new_lead → researching` on its own. So the value
mostly means "somebody picked this up", not "somebody is researching it".
Splitting on what actually happened to the record afterwards:

**12 have a logged call.** Somebody rang them. Under any reading these are
**Contacted** — mapping them to Qualified would erase real call history from
the funnel and put twelve companies behind where the work has already got to.
This is the group a flat remap gets most wrong.

**21 are assigned but have never been called.** Owned, worked, nobody has
reached out yet. **Qualified** is the honest home: it is the same position in
the funnel `researching` occupied, and — unlike New Lead — it preserves the
fact that this company was deliberately taken on rather than sitting untouched.

**1 is unassigned and never called.** Nobody owns it and nothing has happened.
That is **New Lead** by definition; calling it Qualified would claim a
judgement nobody made.

## Why not simply `researching → New Lead`

It is defensible on the brief's own logic — research happens after assignment,
so it is not a stage — but it destroys information and wrecks the board. It
would put 85 of 99 companies in one column, so the pipeline's first column
becomes a wall and the other nine tell you nothing. Worse, it would say
"nothing has happened here" about 12 companies somebody has already phoned.

## Why not `researching → Qualified` flat

That is what `LEGACY_STAGE_ALIASES` does today at read time, and it is the
right *fallback* for an unknown row. As a one-off migration, though, we can do
better than a fallback: the call history is right there, and using it costs
nothing.

## The one thing to check before approving

The 12 moving to Contacted are decided by "has at least one row in
`crm_calls`". If Brent logs calls somewhere else, or if some of those calls
were attempts that never reached anybody, that number should be looked at
before the remap runs. `verify.sql` lists them by name so they can be eyeballed
first — that is the intended order: run the listing, look at the twelve, then
run the remap.

## Reversibility

`remap.sql` stamps every row it touches with an activity carrying the old
value, so `rollback.sql` can put each row back exactly where it was — the same
pattern as the OTR conversion. It does **not** touch `stage_changed_at`:
re-labelling a stage is not the company changing stage, and pretending
otherwise would reset every staleness clock in the book.
