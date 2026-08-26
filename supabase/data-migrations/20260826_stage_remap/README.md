# Stage remap: the old six onto the ten (2026-08-26)

**Applied to production on 2026-08-26.** `remap.sql` is what ran;
`rollback.sql` undoes it.

## The decision

Brent settled the one genuinely ambiguous case himself:

> "i think the company should land into the sales agents inbox as new
> lead/research"

So **`researching` → New Lead**, flat. Research is not a stage under this
model — it is the first *task* on a New Lead, created when the company is
assigned.

An earlier proposal in this directory split `researching` three ways on call
history (12 to Contacted, 21 to Qualified, 1 to New Lead). That was put to
Brent and he ruled against it. Superseded, and the reasoning below is his.

## What ran

| Old value | Rows | Becomes | |
|---|---|---|---|
| `new_lead` | 51 | New Lead | untouched |
| `researching` | 34 | **New Lead** | rewritten |
| `contacted` | 8 | Contacted | untouched |
| `lost` | 5 | Lost | untouched |
| `active_customer` | 1 | **Active** | rewritten |
| `quoting` | 0 | — | no rows existed |

99 rows. **35 actually changed.** The four direct-map values were left alone
rather than rewritten to themselves — an UPDATE that changes nothing still
bumps row versions and muddies an audit.

### After

| Stage | Rows |
|---|---|
| New Lead | **85** |
| Contacted | 8 |
| Lost | 5 |
| Active | 1 |
| Qualified · Engaged · Quoting · Setup · Dormant · Disqualified | **0** |

Verified after: 0 legacy values left anywhere, 0 companies in a forward-only
stage, all 35 undo records carrying their old value.

## The five empty stages are empty on purpose

Qualified, Engaged, Setup, Dormant and Disqualified are **forward-only**: a
person moves a company into one deliberately. Nothing arrives there by
migration, by alias or by automation. Each asserts a judgement somebody made,
and a judgement nobody made is worse than no judgement at all.

There is a test (`lifecycle.test.ts`, "never routes a legacy value into a
forward-only stage") that holds this line for every alias, so a future
vocabulary change cannot quietly deposit companies in one.

## One consequence worth stating plainly

85 of 99 companies are now New Lead. That is the honest reading of Brent's
rule — a company nobody has spoken to is a new lead whatever the old label
claimed — but it does mean the pipeline board's first column holds most of the
book, and the other nine are nearly empty until people start moving companies
along. The empty-column collapse on the board was built for exactly this
shape.

Twelve of the 34 remapped companies have a logged call in `crm_calls`. Under
this mapping they read as New Lead despite having been phoned. That is a
consequence of the flat rule, not a defect in it — flagged here because it is
visible in the data and somebody will notice.

## Two things it deliberately did NOT do

**It did not touch `stage_changed_at`.** Re-labelling a stage is not the
company changing stage. Stamping it would have reset every staleness clock in
the book and made 35 companies look freshly moved. Verified after: still NULL
on every row.

**It did not remove the legacy aliases from the code.** `normalizeStage()`
still maps `researching` and `active_customer`, because they remain the safety
net for anything that predates the remap — a stale cache, an export, a row
restored from a backup.

## The code change that had to go with it

Assignment used to auto-advance `new_lead → researching` (later `qualified`)
the moment somebody claimed a company. That was removed in the same commit. It
contradicted the rule directly — a company handed to an agent is supposed to
*be* a New Lead in their inbox — and it would have quietly undone this remap
one company at a time as each was assigned.

## Rolling back

`rollback.sql` finds the batch by the marker on each row's activity
(`meta->>'migration' = 'stage_remap_2026_08_26'`), which carries the old value
in `meta->>'from'`. Not by a time window and not by the current stage.

It reverts only rows whose stage has **not** been touched since. If somebody
made a real stage change afterwards, that row is left alone and reported.
Undoing a re-labelling must never undo somebody's decision.
