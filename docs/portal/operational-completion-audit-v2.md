# Operational Completion Audit — v2 (QA Re-Score)

**Date:** 2026-08-07
**Purpose:** independently re-verify, against the current codebase (`origin/main`, `git pull` confirmed up to date), every capability claimed by the Phase 5A/5B/5C/5D and Phase 6.1–6.9 commits that shipped since the original [`operational-completion-audit.md`](operational-completion-audit.md) (Phase 5, 2026-08-06) established a ~25% operational-readiness baseline. This is QA, not a victory lap: every claim below was checked against the actual server action, its actual UI caller, and confirmation that the old placeholder text/state was actually removed — not inferred from a commit message.

**Method:** 100% read-only, same as the original audit. Six independent verification passes were run in parallel, each assigned a slice of the claimed work, each instructed to be skeptical and to ground every verdict in file:line evidence. No application code was written or modified to produce this report.

**Commits verified** (confirmed present via `git log`): `6a3479f` AR mark paid/unpaid + Load Detail write parity · `1d3f42f` Trip CRUD · `706ec33` Broker CRUD · `3474b8d` Maintenance writes · `1ca2f1f` Settings writes · `ac1db65` Revenue pipeline · `2f0b832` Reach · `5638b6c` Load Inquiry · `22eb4ed` Mobile Load Detail rebuild · `3bf3564` + `be5c78f` bug fixes · `d7ff6f9` Today evolution · `3d2a60a` mobile scroll fix · `679aafa`–`629e2d3` Phase 6.1–6.9 batch.

---

## Headline finding

**The write-layer gap this audit exists to measure has closed by roughly 60 percentage points.** All four production-readiness measurements from the original audit — entity transition coverage (unweighted and frequency-weighted), end-to-end chain completion, and mobile field-workflow completion — now converge tightly in the **81–89% range**, up from **14–36%** at baseline. That convergence is itself meaningful: at baseline the four methods disagreed sharply (14% to 36%) because completion was spotty and method-dependent; now they agree closely, which is what genuine, broad-based completion looks like rather than a few isolated wins dressed up in a good commit message.

Every single Tier-1 item from the original roadmap — mark paid/unpaid (all four surfaces), POD + BOL signature capture, per-load expenses, broker create/edit, trip create/close/reopen/odometer, and settings write forms — is **confirmed working**, independently, by this pass. So is the single most consequential finding of the original audit: **`recordPayment`, the function found to have zero callers anywhere in the entire codebase (legacy included), is now genuinely wired to a real form that inserts a payment and advances the lead through the funnel.** The mobile-driver walkthrough that broke immediately after "mark delivered" in the original audit now **completes end to end on a phone**.

This is not a claim that everything is done — real gaps remain and are catalogued in full below, along with a handful of inconsistencies introduced by a build this large. But the central question this audit series exists to answer — *could Brent run the company from tms-v2 alone* — now has a fundamentally different answer than it did 24 hours ago.

---

## Table of contents

1. [Verification results by phase](#1-verification-results-by-phase)
2. [Updated state-machine transition coverage](#2-updated-state-machine-transition-coverage)
3. [Updated six-chain trace](#3-updated-six-chain-trace)
4. [Updated mobile field-workflow matrix](#4-updated-mobile-field-workflow-matrix)
5. [Remaining gaps, dead ends, and one-way workflows](#5-remaining-gaps-dead-ends-and-one-way-workflows)
6. [New regressions and inconsistencies introduced by this build](#6-new-regressions-and-inconsistencies-introduced-by-this-build)
7. [Recomputed production-readiness score](#7-recomputed-production-readiness-score)
8. [Go / no-go verdict](#8-go--no-go-verdict)

---

## 1) Verification results by phase

| Phase | Claim | Independently verified? |
|---|---|---|
| **5A** — AR mark paid/unpaid + Load Detail write parity | Mark paid/unpaid, add/delete per-load expense, delete load, doc upload, BOL e-sign (both roles) | **10 of 11 checked items CONFIRMED WORKING.** The one gap: a TONU'd load has no path back to any other status — confirmed still a true dead end in tms-v2 specifically (see §5). |
| **5A** — Trip create/edit/close/reopen/odometer/delete | Full Trip CRUD | **6 of 6 CONFIRMED WORKING**, including a dedicated "New Trip" flow (captures a real start date, unlike the old implicit-via-Load-form path) and a full odometer-bookend form feeding Net. |
| **5A** — Broker create/edit/archive/restore + contact CRUD | Full Broker CRUD, notes, status, contacts | **7 of 7 CONFIRMED WORKING.** Notes are now both rendered *and* editable — previously a fetched-but-discarded dead value. Broker restore (`restoreBroker`) also confirmed, which the original audit found missing in *both* apps. |
| **5A** — Maintenance log/edit/delete service+parts, receipts, reminders | Log/edit/delete a service visit, delete a part (with the legacy last-part cascade preserved), attach/remove a receipt, dismiss a reminder | **Mostly confirmed.** Log/edit/delete service, part deletion with cascade, and receipt attach all work. Reminder **dismiss** is now genuinely wired — notably *more* complete than legacy, whose own dismiss action was itself dead code. Gaps: no **un**-dismiss surface, no deep-link flow, no preventative/category views, and one orphaned standalone `deleteReceipt` action (removal works, but only via the edit-service form, not the export that claims to back it). |
| **5A** — Settings write forms (fuel/factoring %, profit goals) | Editable MPG, diesel $/gal, factoring %, monthly/annual net goal | **CONFIRMED WORKING**, and — critically — verified to write to the *same* `dispatch_settings` row that the Net calculation actually reads, ruling out the most dangerous possible failure mode (a settings form that silently doesn't affect real math). Current cash and a demo-mode toggle remain unavailable from tms-v2. |
| **5B** — Revenue pipeline: record payment, estimate/finalized-quote/BOL send | The entire quote-to-cash pipeline | **CONFIRMED WORKING END TO END.** Send estimate, send finalized quote, send BOL, record payment, and undo-payment are all wired to real forms calling real server actions with real Resend-backed email sends. `recordPayment` is literally the same previously-dead function, now invoked from a real "Record payment" form. A lead can be walked from `new` to `ready_to_dispatch` entirely inside tms-v2. |
| **5B** — Reach (backhaul outreach) | Full port of legacy's mature tool | **CONFIRMED — a genuine port, not a stand-in**, for everything that sends: posture detection, market matching, warmth scoring, held-back suppression, templates, send + test-send all verified to call real, unchanged legacy logic and a real `resend.emails.send()`. One secondary piece cut: the standalone Contacts-management tab (the underlying data field is still settable, just from the Brokers page instead). |
| **5B** — Load Inquiry | One-off broker email tool | **CONFIRMED WORKING** — parse, live preview, send, test-send all real. One secondary piece cut: the post-send "add this broker" quick-add convenience. |
| **5C** — Mobile Load Detail rebuild | Single-scroll, thumb-first workspace | **CONFIRMED** — verified as part of the Load Detail pass; every new write action (mark paid, expenses, documents, signatures) lives on the same continuous scroll, no new tabs introduced. |
| **5D** — Today/Dashboard evolution | Inline odometer + doc upload, alert dismiss/undo, goal widget, opportunity card, new-lead signal | **4 of 6 CONFIRMED, 2 NOT DELIVERED.** Inline odometer entry, alert dismiss/undo (with a real 4-second undo window), a single-goal countdown card, and an empty-truck opportunity card are all real. **Inline document upload was not shipped** (only odometer landed, despite the commit's framing implying both) and **no new-lead/application signal was added** to Today's attention categories. |
| — | Bug fix: current-odo = max across loads AND service logs | **CONFIRMED WORKING**, verified at both call sites. |
| — | Bug fix: loads without pickup_date no longer dropped from period views | **CONFIRMED WORKING**, verified at all four dependent surfaces (Today, Load Board, Calendar, Performance). |
| — | Mobile scroll fix on Loads/Expenses | **CONFIRMED** — a real, symmetric fix (not a one-breakpoint patch), and the underlying `PageScroll` change benefits every list route in the app, not just the two named. |
| **6.1** — Applications detail + trash/restore | | **CONFIRMED, 5 of 5.** Rows are now real links; detail view has contact actions; trash/restore/permanent-delete all wired. |
| **6.2** — In-cab Camera capture | | **CONFIRMED, genuine capture flow** — real `getUserMedia` rear-camera access with a file-picker fallback, no longer deferred to `/admin/camera`. Batch **rename** remains missing, but this was confirmed dead code in *both* apps predating this work, not something Phase 6.2 broke. |
| **6.3** — Bulk actions (Expenses, Quotes, Applications) | | **CONFIRMED, all three entities.** Real row-selection UI, real bulk server actions. |
| **6.4** — Restore soft-deleted Loads/Trips | | **CONFIRMED, scoped exactly as claimed** (Loads and Trips only — Brokers already had it, Expenses explicitly and deliberately excluded, with the reasoning left in a code comment). |
| **6.5** — CSV export/import | | **Export confirmed for both Loads and Expenses. Import confirmed for Expenses. Loads import explicitly and honestly out of scope** (the commit itself explains why: loads carry broker/trip linkage with no existing bulk-import precedent to port). |
| **6.6** — Column sorting + saved filters | | **CONFIRMED**, real server-side sort for Loads, real in-memory sort for Expenses, real `localStorage`-backed saved views for both. |
| **6.7** — Expense payment-method CRUD | | **CONFIRMED, all three operations (create/edit/delete).** |
| **6.8** — Performance trend charts | | **Partially confirmed.** A real trailing-6-month Net trend chart now exists, but it's a separate feature from the "vs goal" framing (which remains a static current-month gauge, not a trend-vs-goal chart). No rate-trend line chart was built — and, checking the commit itself, none was ever promised; that was a QA-checklist assumption, not a scope miss. |
| **6.9** — Global search breadth | | **CONFIRMED.** Files group added; Loads and Brokers now match on multiple fields (4 and 5 respectively) instead of one. |

---

## 2) Updated state-machine transition coverage

Same 9 entities, same transition-counting method as the original audit (only transitions with a real, confirmed UI caller are counted; transitions that are dead code in legacy itself, like the still-unfixed manual lead-status override, are excluded from the denominator exactly as before).

| Entity | Transitions counted | Present in tms-v2 (baseline) | Present in tms-v2 (now) | Coverage now |
|---|---|---|---|---|
| Load | 8 | 4 (50%) | 7 — **only tonu-reversal still missing** | **87.5%** |
| Quote/Lead | 7 | 0 (0%) | 7 — send-estimate, awaiting_confirmation (shared customer route), send-finalized-quote, record-payment auto-advance, trash, restore, permanent-delete all confirmed | **100%** |
| Trip | 4 | 0.5 (13%) | 4 — create, close, reopen, delete all confirmed (restore also now present, exceeding the original scope) | **100%** |
| Maintenance | 5 | 0 (0%) | 3 — log-service, dismiss, delete confirmed; **undismiss and attach-related still missing** | **60%** |
| Broker | 3 | 0.5 (17%) | 3 — create, status-both-directions, archive all confirmed (restore also now present) | **100%** |
| Expense (recurring) | 7 | 3 (43%) | 5 — create/archive/restore (pre-existing) + delete (via bulk) + payment-method CRUD now confirmed; **skip-next-payment and duplicate still missing** | **71%** |
| Application | 3 | 0 (0%) | 3 — trash, restore, permanent-delete all confirmed | **100%** |
| Camera | 5 | 0 (0%) | 4 — create-batch, capture, delete-photo, delete-batch confirmed; **rename still missing** (dead in both apps) | **80%** |
| Files/documents (load docs) | 3 | 0 (0%) | 3 — upload, sign (both roles), delete all confirmed | **100%** |
| **Unweighted average** | | **~14%** | | **~89%** |

**Frequency-weighted** (same weights as baseline: Load 25, Quote/Lead 15, Trip 10, Maintenance 8, Broker 10, Expense 15, Application 3, Camera 5, Files 9):

`(25×0.875) + (15×1.00) + (10×1.00) + (8×0.60) + (10×1.00) + (15×0.71) + (3×1.00) + (5×0.80) + (9×1.00)`
`= 21.9 + 15 + 10 + 4.8 + 10 + 10.65 + 3 + 4 + 9 ≈ 88%`

Of the 9 entities, **7 now have real, confirmed write capability** (up from 2 at baseline). Only Maintenance and Expense fall short of full coverage, and both are missing specific secondary transitions (un-dismiss, attach-related-repairs, skip-payment, duplicate) rather than being read-only surfaces.

---

## 3) Updated six-chain trace

Same six chains from the original audit, re-walked against the verified current code.

| Chain | Baseline | Now | What changed |
|---|---|---|---|
| **A** — Quote → Estimate → Negotiation → Accepted → Load → Delivered → Paid → Archived | ~18% (broke at step 1 of 7 for the whole sales pipeline) | **~95%** | Steps 1–10 all confirmed working: send estimate, send finalized quote, customer acceptance (shared route), `recordPayment` auto-advancing to `ready_to_dispatch`, load creation/delivery, and mark-paid all real. Step 11 (archive the lead) is reached via the quotes trash mechanism rather than a dedicated `lead_status='archived'` write — functionally equivalent, not a full-fidelity match to the original enum value. |
| **B** — New Broker → First Load → Invoice → Payment | ~70% (implicit broker creation only, permanently incomplete record) | **100%** | Dedicated broker creation (capturing MC#/DOT#/factoring, not just a name) now exists alongside the load path; contacts addable; mark-paid confirmed. |
| **C** — New Trip → Assigned Loads → Odometers → Closed → Reopened | ~40% (broke at odometer entry) | **100%** | Dedicated trip creation with a real start date, odometer bookends, close, and reopen are all confirmed working. |
| **D** — Maintenance Reminder → Repair → Receipt → Completed → Future Reminder | ~20% (view-only) | **~90%** | Log-repair, receipt attach, and reminder dismiss all confirmed; the reminder→future-reminder recompute is a pre-existing read calculation now finally fed by real write data, though the exact resolve-on-log behavior wasn't independently re-derived line-by-line this pass. |
| **E** — Expense Created → Completed → Attached → Accounted | ~50% (parity with legacy, both break at attachment + reporting) | **~50%, unchanged** | No agent found evidence that receipt attachment on recurring expenses or recurring-expense-into-a-reconciliation-report was addressed. This remains a whole-product gap, not a tms-v2-specific one, exactly as flagged at baseline. |
| **F** — Driver Delivery → POD → Signature → Invoice Ready → Payment Received | ~20% (broke immediately after "mark delivered") | **100%** | POD capture, BOL e-signature (both roles), and mark-paid are all confirmed working on the same Load Detail scroll. This was the single most consequential broken chain in the original audit and is now the most complete. |

`(95+100+100+90+50+100)/6 ≈ 89%`

---

## 4) Updated mobile field-workflow matrix

Same 15-row matrix from the original audit's §7 (§7 there says "14 workflows" but scored 15 rows including the Expenses split — this recomputation uses the identical row set for a true apples-to-apples comparison).

| Workflow | Baseline score | Now | Evidence |
|---|---|---|---|
| Dispatch | 100 | 100 | unchanged |
| Pickup (odometer) | 60 | 65 | Reachable from more places now (Today row, Load Detail, Trip), but input ergonomics unimproved — still no `inputMode="numeric"`, still a full-modal takeover for a one-field edit |
| Delivery (odometer) | 85 | 85 | unchanged, still good |
| Fuel | 30 | 30 | unchanged — still no logged-transaction concept anywhere, shared gap with legacy |
| Expenses — recurring | 85 | 85 | unchanged |
| **Expenses — per-load** | 0 | **85** | Inline add/delete confirmed, mobile-appropriate |
| **Maintenance logging** | 5 | **80** | Full log-service form with receipt upload confirmed |
| **Camera capture** | 0 | **90** | Live rear-camera capture confirmed, purpose-built |
| **BOL scan** | 5 | **85** | Dedicated in-app scanner + fallback confirmed |
| **POD capture** | 0 | **90** | Rear-camera-forced with confirm step, confirmed |
| **Signatures** | 0 | **90** | Dedicated full-screen touch flow, confirmed |
| **Documents (upload)** | 10 | **85** | Signed-URL upload + delete, confirmed |
| **Trip management** | 20 | **85** | Full CRUD via mobile Fab + modals, confirmed |
| **Load completion (incl. payment)** | 40 | **90** | Both status and payment sides confirmed |
| **Receivables (act)** | 50 | **75** | Mark-paid confirmed working; small touch target |
| **Average** | **~33%** | **~81%** | |

**New mobile-specific finding this pass:** the new inline row-actions introduced across this build (Today's odometer button, Receivables' `MarkPaidCell`, the per-document-kind buttons on Load Detail) are consistently sized `h-7` (28px) — smaller than the app's own `Button` "sm" primitive (`h-8`, 32px) and below typical ≥44px touch-target guidance. Not unusably small, but a real one-handed/gloved-hands ergonomics regression relative to the design system's own standard, worth a follow-up pass.

**The headline verdict from the original audit — "a driver cannot complete a full day using only a phone and only tms-v2" — is reversed.** The chain now walks cleanly: dispatch → pickup → delivery → POD capture → BOL scan → signature → mark paid → next dispatch, entirely on a phone, without leaving tms-v2.

---

## 5) Remaining gaps, dead ends, and one-way workflows

Everything independently confirmed still missing or still broken, ranked by operational significance.

1. **TONU is a permanent dead end in tms-v2 specifically.** Once a load is marked TONU, there is no status field, no button, no form anywhere in tms-v2 to reverse it — `editLoadOdometer` explicitly refuses to touch status on a TONU'd load, and `markLoadDelivered` has no path back either since the UI hides the button once TONU'd. Legacy retains an escape hatch (the Edit-Load status dropdown); tms-v2 does not. **This is the single highest-priority remaining gap** — a fat-fingered TONU click has no recovery path short of a direct database edit.
2. **Receivables page has no in-place undo / "recently paid" list.** Mark-paid works there, but undo only works by navigating to that specific load's own detail page — a real, if minor, workflow regression versus the legacy page it was ported from.
3. **Maintenance: no un-dismiss surface, no deep-link (`?log=`) flow, no preventative/category/set views**, and one orphaned `deleteReceipt` export with zero callers (the working removal path goes through the edit-service form instead).
4. **Settings: current cash and demo mode still have no write path anywhere in tms-v2.** Current cash exists as a writable field in legacy, just on a different page (the dashboard's countdown widget) — not a schema gap, a missing surface.
5. **Manual lead-status override remains unbuilt in both apps** — unchanged from baseline, not a regression, but still a real limitation if a lead ever needs a manual correction outside the send/payment auto-advance flow.
6. **Reach has no standalone Contacts-management tab** (Include/Exclude backhaul toggle, "Farm a contact" shortcut) — the underlying field is settable, just from the Brokers page instead of from within Reach itself.
7. **Load Inquiry has no post-send "add this broker" convenience flow.**
8. **Camera batch rename is still missing** — confirmed dead code in *both* apps, predating this work.
9. **Loads CSV import is explicitly out of scope**, disclosed honestly in its own commit.
10. **Performance has no true rate-trend chart and no real trend-vs-goal chart** (only a separate Net-only trend plus a static current-month goal gauge); broker/lane leaderboards remain capped at 6 rows with no drill-down.
11. **Expense skip-next-payment and duplicate-expense remain unbuilt.**
12. **Today has no inline document-upload row action** (only odometer landed) and **still surfaces no new-lead/new-application signal** — both were implied or explicitly recommended in the original audit's roadmap and were not delivered in this build.
13. **Expense receipt attachment, and folding recurring expenses into any reconciliation/report view, remain unbuilt in both apps** (Chain E) — a whole-product gap, not tms-v2-specific.
14. **Fuel has no distinct logged-transaction concept anywhere** — still only a computed MPG/diesel-price estimate, in both apps.

**One-way workflows found this pass:** TONU (item 1, now confirmed fully one-way in tms-v2 specifically, where it was only *mostly* one-way in legacy). No other new one-way workflows were found — every other write action verified this pass has a real reverse/undo path (mark paid ⇄ unpaid, archive ⇄ restore on Brokers/Expenses/Applications, close ⇄ reopen on Trips, dismiss on Maintenance reminders even if un-dismiss isn't yet exposed anywhere to use it).

---

## 6) New regressions and inconsistencies introduced by this build

**No functional regressions were found** — nothing that worked before this build now works less well. What was found is a small set of inconsistencies and one latent defense-in-depth gap, all minor relative to the scale of what shipped correctly:

1. **`markLoadDelivered` has no TONU guard at the action layer** (unlike `editLoadOdometer`, which explicitly checks). It's currently safe only because the UI hides the relevant button once a load is TONU'd — there's no server-side defense if that button ever becomes reachable another way (a future bulk action, an API caller). Worth hardening to match the pattern already used elsewhere in the same file.
2. **Inconsistent demo-mode handling between Settings and Maintenance.** Settings' new write actions use the app's canonical `mutation()` wrapper, which returns an explicit "nothing was saved" reason and visibly disables the form. Maintenance's new actions instead reuse legacy's silent no-op convention with zero on-screen indication anything was skipped — in demo mode, a user could log a service, see "saved," and have nothing actually persist, with no visible cue why.
3. **Orphaned `deleteReceipt` action** — exported, correctly implemented, zero callers. The real removal path goes through a different mechanism (`updateService`'s batch-remove), and a future developer trusting this export's own doc comment ("what the doc viewer's Delete calls") would be wrong.
4. **Today's commit description implies more than shipped** — its framing echoes the original audit's "odometer entry *and* document upload" recommendation, but only the odometer half landed, with no in-code comment flagging document upload as deferred (unlike Trip/Maintenance, which do self-document their remaining gaps).
5. **Touch-target sizing inconsistency** — the batch's new inline row-actions are uniformly smaller (28px) than the app's own established button standard (32px), a design-system drift introduced across several new components at once.

None of these block a business transaction; all are worth a fast follow-up pass but none change the overall readiness picture below.

---

## 7) Recomputed production-readiness score

Same four measurements, same methodology, as the original audit — directly comparable.

| Measurement | Baseline (2026-08-06) | Now (2026-08-07) |
|---|---|---|
| Entity transition coverage (unweighted) | ~14% | **~89%** |
| Entity transition coverage (frequency-weighted) | ~22% | **~88%** |
| End-to-end chain completion | ~36% | **~89%** |
| Mobile field-workflow completion | ~33% | **~81%** |

**Headline number: ~85% operationally complete**, up from ~25% at baseline — a blended read weighted toward the frequency-weighted entity score, exactly as in the original methodology, with the other three as corroborating checks.

**What changed about the read-vs-write framing that drove the baseline's caveat:** the original audit's critical caveat was that the ~25% figure was a *write*-completeness score against a *read* layer that was already ~90%+ complete — meaning tms-v2 was "a very good reporting dashboard bolted onto a partial dispatch tool." That gap has now largely closed. The write layer, at ~85%, is approaching parity with the read layer's prior lead. tms-v2 is no longer structurally lopsided between what it can show and what it can do.

**Why the four measurements now agree so closely** (81–89%, vs. 14–36% at baseline): at baseline, completion was concentrated in a couple of entities (Load, Expense) while everything else was zero, so a method that weighted by entity (harsh) diverged sharply from a method that credited partial chain progress (forgiving). Now that 7 of 9 entities have real write capability and every chain either completes or comes close, the four lenses see roughly the same picture from different angles — which is itself evidence that the completion is broad-based rather than a few showcase features.

---

## 8) Go / no-go verdict

**Conditional GO — tms-v2 is now ready to be the primary system for daily operations.** Every Tier-1 item from the original roadmap (the fixes rated as blocking a complete, common, daily transaction) is confirmed working: marking a load paid, capturing and signing delivery paperwork, logging a per-load expense, creating and managing a broker relationship, running a trip start to finish, and editing the settings that drive every Net calculation in the app. The entire quote-to-cash revenue pipeline — previously blocked by a function with zero callers anywhere in the codebase — now works end to end. A driver can complete a full day standing beside the truck with only a phone.

**What still, narrowly, forces a trip back to `/admin`:**
- **Recovering a fat-fingered TONU** — the highest-priority item on this list; right now the only fix is a direct database edit.
- **Setting current cash** or **toggling demo mode** from within tms-v2.
- **Un-dismissing a maintenance reminder**, or using the preventative/category/per-position maintenance views.
- **Managing Reach's Contacts/Include-in-backhaul list** as a dedicated surface (workable via Brokers instead, just not from Reach).
- **Skipping a single recurring-expense payment**, or **duplicating** one.
- **Attaching a receipt to a recurring expense**, or seeing recurring expenses folded into any reconciliation report — though this is a whole-product gap, not something `/admin` can do either.
- **A rate-trend performance chart**, or a **broker/lane leaderboard beyond the top 6** — reporting nice-to-haves, not operational blockers.

None of these force a return to `/admin` to complete a normal business transaction — quoting, booking, dispatching, delivering, invoicing, collecting payment, running a trip, servicing the truck, and managing a broker relationship are all now genuinely completable inside tms-v2, most of them on a phone. The remaining list is real and should be tracked, but it is a punch list of edge cases and secondary conveniences, not a set of missing pipelines. **Recommendation: `/admin` can move from primary system to fallback-for-edge-cases status now; a full decommission should wait for the TONU-recovery fix at minimum, given it's the one item on this list with no workaround at all short of a database edit.**
