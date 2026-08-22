# ASSIGNMENT AUDIT — company claim / assign / reassign

**Scope:** read-only. No code, schema, or deploy changes. tms-v2 untouched.
**Date:** 2026-08-22 · **Branch:** main @ a5b4714

Goal being audited: an assign/claim control at the TOP of the company profile, where
(a) UNCLAIMED companies are claimable by ANY CRM user, and (b) only ADMINS (`role='owner'`)
may change/reassign/unassign an ALREADY-CLAIMED company — enforced server-side.

---

## 1. OWNERSHIP DATA — `crm_accounts.assigned_user_id`

### Column definition

`supabase/migrations/20260557000000_crm_foundation.sql:119`

```sql
assigned_user_id uuid references public.crm_profiles(id) on delete set null,
```

- **Nullable** — NULL *is* the "unclaimed" state, and every claim surface keys on it.
- **FK → `crm_profiles(id)`**, `on delete set null` (a deleted profile orphans its companies rather than cascading).
- Indexed: `crm_accounts_assigned_idx on (assigned_user_id)` — `supabase/migrations/20260557000000_crm_foundation.sql:130`.
- No CHECK constraint, no trigger on this column. **No DB-level role rule exists today.**

### RLS is org-scoped only — not owner-scoped

`supabase/migrations/20260557000000_crm_foundation.sql:499-503`

```sql
create policy crm_accounts_rw on public.crm_accounts
  for all to authenticated
  using (org_id = public.crm_current_org())
  with check (org_id = public.crm_current_org());
```

Same shape as the `crm_profiles_rw` hole documented in `20260818000000_crm_profiles_role_lockdown.sql:6-20`:
a row-level policy constrains *which rows*, never *which columns*. Any signed-in CRM member can
reach `crm_accounts` directly through the publishable-key client (an established pattern in this
codebase — see `LoginForm.tsx`'s direct `.from("crm_profiles")` calls) and run
`update({assigned_user_id: myId})` on any company in their org. **RLS will not enforce Brent's rule.**
See §6 hardening note under the plan.

### Every writer of `assigned_user_id` today

| # | Writer | File:line | Behavior |
|---|--------|-----------|----------|
| 1 | `createAccount()` | `src/app/crm/(authed)/accounts/actions.ts:198,207` | `options?.unassigned ? null : (optStr(fd,"assigned_user_id") ?? user.id)` — **defaults to the creator**. |
| 2 | `createAccount({unassigned:true})` | same; callers in `admin/bol-center/actions.ts`, `admin/otr/actions.ts` | BOL/OTR-created prospects land **NULL** so they hit the claim queue. Docstring at `accounts/actions.ts:164-178` explains why an empty form value can't do this (`optStr` maps `""`→null, then `?? user.id` fires). |
| 3 | `updateAccount()` | `src/app/crm/(authed)/accounts/actions.ts:259,266` | `const assigned = optStr(fd,"assigned_user_id"); ...(assigned !== null ? {assigned_user_id: assigned} : {})`. **NO role check.** This is the de-facto reassign path today. |
| 4 | `claimAiLead()` | `src/app/crm/(authed)/ai-agent/actions.ts:38` | `.update({assigned_user_id: user.id})` guarded on `.is("assigned_user_id", null)` — see §5. |
| 5 | `suspendAndReassignMember()` | `src/app/crm/(authed)/admin/actions.ts:189-190` | Bulk: moves a suspended member's **entire book** to another rep. Owner-only, service-role client. |
| 6 | `promoteAccountToProspect()` | `src/app/crm/(authed)/accounts/actions.ts:369-371` | Explicitly **never writes** `assigned_user_id` — docstring says leaving it untouched is what keeps the company claimable. |

### Is there an existing "assign/reassign/unassign a company" action or UI?

**No dedicated one.** Exhaustively:

- **Company profile (desktop):** `desktop/ProfileTopBar.tsx:64-77` renders an **Owner chip — display only**. No control.
- **Company profile (mobile):** `[id]/CompanyHeader.tsx:88` renders `<RepBadge>`. Its own docstring (`CompanyHeader.tsx:8-11`) states it is *"purely a display (changing the rep is still done through the Edit button's 'Assigned rep' field)"*.
- **Companies list:** `accounts/AccountsFilters.tsx:117` has an `unassigned` **filter** option only. `CompanyTable.tsx` / `CompanyListCard.tsx` have no assign action (their `canAssignOthers` prop is about **tasks**, not companies — it flows to `TaskRow`).
- **Admin:** `admin/accounts/[userId]/SuspendReassignDialog.tsx` — bulk book-transfer tied to suspension only. Not a per-company control.
- **Prospects queue:** `ai-agent/LeadCard.tsx:78-80` "Claim" button → `claimAiLead()`. Queue-only; the card leaves the list once claimed.

**The only per-company reassign that exists** is the buried
`CompanyDialog.tsx:344-370` → *Assignment* section → **"Assigned rep"** `<SelectField>` (with an
`"" = Unassigned` option), submitted to `updateAccount()`. It is:
- not at the top of the profile (it's inside the Edit modal, below Lifecycle),
- **not role-gated in the UI**, and
- **not role-gated on the server** (`actions.ts:259-266`).

> **Security finding (current, pre-feature):** any `role='member'` can today reassign or unassign
> *any* company in the org — including one owned by another rep — via Edit → Assigned rep, or
> directly against PostgREST. Brent's rule (b) is currently violated by the existing UI.

---

## 2. WHO IS "ADMIN" — the role model

### `CrmUser` carries both `id` and `role` ✅

`src/lib/crm/auth.ts:11-17,51-57`

```ts
export type CrmUser = { id: string; email: string; orgId: string; fullName: string | null; role: string };
```

`requireCrmUser()` (`auth.ts:30-58`) resolves the Supabase session, then reads
`crm_profiles(org_id, full_name, email, role, is_active)`; a missing or inactive profile redirects to
`/crm/login?error=no_access`. `role` falls back to `"member"` (`auth.ts:56`). **Every server action can
check `user.role === "owner"` with no extra query.**

### `requireCrmAdmin()`

`src/app/crm/(authed)/admin/guard.ts:15-19` — `requireCrmUser()` then `if (user.role !== "owner") redirect("/crm")`.
Its docstring (`guard.ts:4-14`) is explicit that this is a **page gate, defense in depth** —
*"every mutating action in ./actions.ts re-verifies role='owner' itself"*. A new assign action must
do its own check, not lean on a page gate.

### The `crm_profiles_guard_role` trigger

`supabase/migrations/20260818000000_crm_profiles_role_lockdown.sql:62-76` — BEFORE INSERT/UPDATE on
`crm_profiles`: when `current_user in ('authenticated','anon')`, INSERT must have `role='member'` and
UPDATE must leave `role` unchanged; else `raise exception ... errcode='42501'`. Verified live
(`:47-56`). **Consequence: `role` cannot be self-escalated, so `user.role === 'owner'` read from
`crm_profiles` is trustworthy** — which is exactly what makes an app-layer role check sound here.
Note the migration's own lesson (`:22-34`): column-level `REVOKE` is a **no-op** in this schema
because table-level grants override it; a trigger is the only DB-level enforcement that works.

### How server actions check role today (the precedents to copy)

| Action | File:line | Pattern |
|---|---|---|
| `deleteAccount` | `accounts/actions.ts` (`if (user.role !== "owner")`) | `return { ok:false, error:"Only an admin can delete a company." }` |
| `createTask` | `tasks/actions.ts:67-71` | `if (rawAssignee && user.role !== "owner" && rawAssignee !== user.id) return {ok:false, error:"Only an admin can assign tasks to someone else."}` |
| `updateTask` | `tasks/actions.ts:133-139` | same rule, only when `formData.has("assigned_user_id")` |
| `getCompanyVisibility` | `_shell/companyVisibility.ts:30` | `if (user.role === "owner") return {restricted:false, ...}` |

`tasks/actions.ts:67-71` is the **closest existing analogue** to the rule Brent wants — assign-to-self
allowed for everyone, assign-to-others owner-only.

---

## 3. THE HEADER — where the control slots in

### Desktop: `accounts/[id]/desktop/ProfileTopBar.tsx`

Server Component. 56px sticky row: BackButton · divider · `CompanyAvatar` + name + stage `Badge` ·
**flex spacer** · Owner cluster · `CompanyMoreMenu` · `EditCompany` (`ProfileTopBar.tsx:46-81`).

The owner cluster, verbatim (`ProfileTopBar.tsx:64-77`):

```tsx
<div className="flex shrink-0 items-center gap-2">
  <span className="text-[12px] font-medium text-fg-muted">Owner</span>
  {ownerLabel ? (
    <span className="... rounded-full border border-line-strong bg-inset ...">
      <span className="... rounded-full bg-accent text-[10px] font-bold text-white">{ownerInitial || "?"}</span>
      {ownerLabel}
    </span>
  ) : (
    <span className="... bg-inset px-2.5 py-1 ... text-fg-muted">Unassigned</span>
  )}
  <CompanyMoreMenu ... />
  <EditCompany ... />
</div>
```

- `ownerLabel: string | null` — *"Assigned rep's display name, or null when the company is unassigned"* (`:37`).
- Fed from `page.tsx:599` `ownerLabel={currentRepLabel}`, derived at `page.tsx:415-416`:
  `const currentRepId = account.assigned_user_id; const currentRepLabel = reps.find(r => r.id === currentRepId)?.label ?? null;`
- Props already include everything the new control needs: `accountId`, `reps`; and the page already
  computes `isOwner` (`page.tsx:75`) and passes `canDelete={isOwner}` (`page.tsx:602`).
- **Standing RSC constraint** (`ProfileTopBar.tsx:16-20`): this is a Server Component — *"Nothing here
  passes a function across the boundary — see the standing RSC rule this route has 500'd over before."*
  The new control must therefore be its **own `"use client"` component** that imports the server
  action directly (exactly how `EditCompany`/`CompanyMoreMenu` already work).

**Slot:** replace the ternary at `:66-77` with the new client component, keeping the `Owner` label
and the pill's visual language. It sits immediately left of More/Edit — the top-of-profile position
Brent asked for.

### Mobile: `accounts/[id]/CompanyHeader.tsx` — **LOCKED**

`RepBadge` (`CompanyHeader.tsx:12-25`) — a plain server-rendered chip, no interaction, rendered at
`:88` between the identity block and `CompanyMoreMenu`/`EditCompany`. `:41-56` documents this bar as
"identity + navigation + rep-at-a-glance only" with two deliberate flex-wrap groups so nothing
collides on narrow screens.

**Recommendation: keep mobile minimal.** Two safe options, in preference order:

1. **Unclaimed-only Claim button (recommended).** Swap only the `!label` branch (`:13-15`,
   currently a bare "Unassigned" span) for a compact **Claim** button. Claimed companies keep the
   existing static `RepBadge` on mobile, so the locked layout never gains a second interactive
   element and admins reassign from desktop or the Edit dialog. Small, contained change; wrap groups
   untouched.
2. **No mobile change at all.** Ship desktop-only; mobile reps still claim from the Prospects tab.

Do **not** add a picker/popover into that flex-wrap row — that's what the lock is protecting.

---

## 4. REP LIST — how assignable reps are fetched

There is **no** `getTaskOfferOptions` in this codebase (grep: 0 hits). The rep roster is derived
inline, from the same query, in four places with an identical shape:

`accounts/[id]/page.tsx:173-177` (the profile — already loaded, reuse it directly):

```ts
const profiles = (profilesRes.data ?? []) as ProfileRow[];   // page.tsx:104 — supabase.from("crm_profiles").select("id, full_name, email, is_active, role")
const reps: RepOption[] = profiles
  .filter((p) => p.is_active)
  .map((p) => ({ id: p.id, label: profileName(p) ?? "Unnamed rep" }))
  .sort((a, b) => a.label.localeCompare(b.label));
```

Type: `RepOption = { id: string; label: string }` — `accounts/CompanyDialog.tsx:71`.
Identical derivations: `accounts/page.tsx:87-90`, `contacts/page.tsx:91`, `contacts/[contactId]/page.tsx:109`,
`customers/ActiveCustomersPanel.tsx:125`.

**The reassign picker needs no new query.** `reps` is already passed into `ProfileTopBar`
(`ProfileTopBar.tsx:40`, `DesktopProfile.tsx:127`) and is already sorted, active-only, and
display-labeled. `profileName()` = `firstName(full_name, email)` (`page.tsx:44-47`).

---

## 5. THE CLAIM QUEUE INTERACTION — `claimAiLead()`

`src/app/crm/(authed)/ai-agent/actions.ts:32-94`. **Confirmed** — all three behaviors Brent described:

1. **Assign, race-safe** (`:36-45`): `.update({assigned_user_id: user.id})` filtered by
   `.in("source", CLAIMABLE_LEAD_SOURCES).eq("ai_status","released").is("deleted_at",null).is("assigned_user_id", null)`,
   `.select(...).maybeSingle()`. If no row comes back → `"This lead is no longer available to claim."` (`:50-52`).
   The `IS NULL` predicate in the UPDATE itself is the concurrency guard — two reps clicking at once,
   only one wins.
2. **Logs** `CRM_ACTIVITY.aiLeadClaimed` — `"Claimed AI lead: <name>"` (`:54-60`).
3. **new_lead → researching + entry task** (`:62-87`): only when `normalizeStage(prior) === "new_lead"`;
   writes `lifecycle_status:"researching"`, logs `lifecycleChanged`, then
   `fireStageEntryTask({ownerUserId: user.id, stage:"researching"})` → the *"Research + first outreach"*
   task (`lib/crm/stageAutomation.ts:33`), assigned to the claimer, duplicate-guarded by
   title+account+status (`stageAutomation.ts:64-73`). A lead already past new_lead is *"just assigned,
   no stage change and no automation"* (`:26-30`).
4. Revalidates `/crm/ai-agent`, `/crm/accounts`, `/crm/accounts/[id]`, `/crm` (`:89-92`).
5. **Allowed for any CRM user** — `requireCrmUser()` only, no role check (`:33`). Matches rule (a).

### ⚠️ `claimAiLead()` cannot be reused for the profile control

Its update is filtered on `.in("source", CLAIMABLE_LEAD_SOURCES)` (`= ["ai_agent","field_capture","bol","otr"]`,
`ai-agent/queue.ts:16`) **and** `.eq("ai_status","released")`. A **manually-created unassigned company**
has `source` NULL/other and `ai_status` NULL (`queue.ts:9-14` spells this out), so `claimAiLead()`
would return `!updated` → *"This lead is no longer available to claim."*

The profile-level claim must be a **new action** that drops the source/ai_status filters and keeps
only `assigned_user_id IS NULL` + `deleted_at IS NULL`, while reproducing steps 1–4 above.

Side effect to keep consistent: `layout.tsx:40-46` badges the **Prospects** nav item with the
unclaimed count using the same `CLAIMABLE_LEAD_SOURCES`/`released`/`IS NULL` predicate, so a
profile-claim of a queue lead correctly decrements it — provided `/crm` and `/crm/ai-agent` are revalidated.

---

# IMPLEMENTATION PLAN

## A. One server action — `src/app/crm/(authed)/accounts/actions.ts`

Add **`assignAccount(accountId: string, targetUserId: string | null): Promise<ActionResult>`**.
One action covers claim, reassign, and unassign; the rule lives in one place.

```
1. const user = await requireCrmUser()
2. read current: .from("crm_accounts").select("assigned_user_id, lifecycle_status, name")
                 .eq("id", accountId).is("deleted_at", null).maybeSingle()
   → not found: { ok:false, error:"Company not found." }
3. const isAdmin = user.role === "owner"
   const currentOwner = row.assigned_user_id
4. AUTHORIZATION (the whole rule):
   if (currentOwner === null) {
     // UNCLAIMED — any CRM user may claim
     if (targetUserId === null) return { ok:false, error:"This company is already unassigned." }
     if (!isAdmin && targetUserId !== user.id)
        return { ok:false, error:"Only an admin can assign a company to someone else." }
   } else {
     // ALREADY CLAIMED — admin only, full stop (covers claimed-by-me too)
     if (!isAdmin) return { ok:false, error:"Only an admin can reassign or unassign a company." }
   }
   if (targetUserId === currentOwner) return { ok:true }   // no-op
5. VALIDATE TARGET (never trust the client beyond an id) — when targetUserId !== null:
   .from("crm_profiles").select("id, is_active").eq("id", targetUserId).maybeSingle()
   → missing/!is_active: { ok:false, error:"Choose an active user." }
   (org scoping is automatic: crm_profiles RLS is org-matched; mirrors admin/actions.ts:176-186)
6. WRITE, race-safe — replicate claimAiLead's guard:
   .update({ assigned_user_id: targetUserId }).eq("id", accountId).is("deleted_at", null)
   + when currentOwner === null: .is("assigned_user_id", null)      ← concurrency guard for claims
   + when currentOwner !== null: .eq("assigned_user_id", currentOwner) ← guard for reassigns
   .select("id").maybeSingle()  → !updated: "This company was just claimed by someone else."
7. LOG: CRM_ACTIVITY.repChanged (already defined, lib/crm/activity.ts:18; already has a timeline
   label + tone at [id]/ActivityTimeline.tsx:71,83 — currently unused, so this finally lights it up).
   Summaries: "Claimed this company" / "Assigned to <label>" / "Reassigned: <from> → <to>" / "Unassigned".
   meta: { from: currentOwner, to: targetUserId }
8. CLAIM-ONLY STAGE ADVANCE — mirror ai-agent/actions.ts:62-87 exactly:
   if (currentOwner === null && targetUserId !== null
       && normalizeStage(row.lifecycle_status) === "new_lead") {
     update lifecycle_status = "researching"
     logActivity(lifecycleChanged, "Stage changed: New Lead → Researching")
     fireStageEntryTask({ orgId, actorUserId: user.id, accountId, ownerUserId: targetUserId, stage:"researching" })
   }
9. revalidateAccount(accountId)   (actions.ts:255-259 — hits /crm/accounts, /crm/contacts, /crm, /crm/accounts/[id])
   + revalidatePath("/crm/ai-agent")   ← so the queue + its nav badge drop the claimed lead
```

**Guardrail notes**
- Step 8 fires **only on a claim from unassigned**, and **only from `new_lead`** — an admin reassigning
  a company at `quoting` never rewinds a stage. Consistent with `claimAiLead` (`:26-30`) and with
  `promoteAccountToProspect`'s `stageRank()` no-downgrade rule (`accounts/actions.ts:369-371`).
- `fireStageEntryTask` assigns to the **new owner** (`ownerUserId: targetUserId`), not the actor —
  correct when an admin claims on someone's behalf; matches `stageAutomation.ts:17-22`.
- `fireStageEntryTask` self-guards against duplicates (`stageAutomation.ts:64-73`), so a company that
  passed through the Prospects queue and got re-claimed won't grow a second "Research + first outreach".

## B. Close the existing back door in `updateAccount()` — **required, not optional**

`accounts/actions.ts:259-266` currently lets any member set `assigned_user_id` through the Edit
dialog. Leaving it means the new rule is bypassable by design. Apply the same gate:

```ts
const assigned = optStr(formData, "assigned_user_id");
if (formData.has("assigned_user_id")) {
  // read prior assigned_user_id in the existing `prior` select (actions.ts:249-253 —
  // add assigned_user_id to that same .select, no extra round-trip)
  if (user.role !== "owner" && assigned !== priorAssigned) {
    if (priorAssigned !== null || assigned !== user.id)
      return { ok:false, error:"Only an admin can change who a company is assigned to." };
  }
}
```

i.e. a member's only permitted transition through Edit is `null → self`; everything else is owner-only.
Same shape as `tasks/actions.ts:133-139`.

Correspondingly, hide the **"Assigned rep"** `<SelectField>` (`CompanyDialog.tsx:357-369`) for
non-owners — pass a `canAssign` prop alongside the existing `canDelete` (`CompanyDialog.tsx:126-133`,
whose own comment already says *"edit mode only. The server action re-checks the role regardless."*).
Non-owners then get one honest assignment surface: the header Claim button.

## C. The header control — `desktop/AssignmentControl.tsx` (new, `"use client"`)

Lives next to `ProfileTopBar.tsx`; imports `assignAccount` directly (no function props across the RSC
boundary — `ProfileTopBar.tsx:16-20`). Props: `accountId`, `ownerId: string|null`, `ownerLabel: string|null`,
`currentUserId`, `currentUserLabel`, `isAdmin`, `reps: RepOption[]`.

| State | Non-admin sees | Admin sees |
|---|---|---|
| **Unclaimed** (`ownerId === null`) | `Owner · [Unassigned]` + **`Claim`** button → `assignAccount(id, me)` | same **`Claim`**, plus a rep picker to assign to anyone (`assignAccount(id, repId)`) |
| **Claimed by me** | `Owner · [●] Me` chip — static, no control | chip + **Reassign** popover (rep list + **Unassign**) |
| **Claimed by someone else** | `Owner · [●] Tyler` chip — static, read-only | chip + **Reassign** popover (rep list + **Unassign**) |

Mechanics: reuse the existing chip markup at `ProfileTopBar.tsx:67-72` verbatim so nothing shifts
visually; `useTransition` + inline error text (same as `LeadCard.tsx:26-43`); `router.refresh()` on
success (unlike `LeadCard`, the profile row survives the write, so refresh is correct here);
popover open / outside-click / Escape pattern copied from `CompanyMoreMenu.tsx:51-65`. Buttons use the
shared tokens in `_shell/ui.tsx:174-186` (`BTN_PRIMARY` for Claim, `BTN_NEUTRAL` for Reassign,
`BTN_DANGER` for Unassign inside the popover).

**Wiring:** `ProfileTopBar.tsx` gains `ownerId`, `currentUserId`, `currentUserLabel`, `isAdmin` props →
threaded through `DesktopProfile.tsx:60-129` → supplied at `page.tsx:593-602` from values the page
**already computes**: `currentRepId` (`:415`), `currentRepLabel` (`:416`), `isOwner` (`:75`),
`currentUser` (`:414`). No new query anywhere.

**Mobile:** per §3, change only `RepBadge`'s `!label` branch (`CompanyHeader.tsx:13-15`) into a Claim
button. Claimed state stays exactly as-is. Or ship desktop-only.

## D. Database change needed?

**None required.** `assigned_user_id` already exists, is nullable, is FK'd, and is indexed
(`crm_foundation.sql:119,130`). The 6-stage lifecycle needs nothing. `CRM_ACTIVITY.repChanged`
already exists in code with a timeline label (`activity.ts:18`, `ActivityTimeline.tsx:71,83`) — and
`crm_activities.kind` has no enum/constraint to extend.

## E. Optional hardening (separate task, Brent's call — DB change, out of this audit's scope)

The app-layer check is bypassable via the publishable-key client, exactly as `crm_profiles.role` was
before `20260818000000`. The proven pattern is a BEFORE UPDATE trigger on `crm_accounts` that, when
`current_user in ('authenticated','anon')`, rejects a change to `assigned_user_id` unless
`old.assigned_user_id is null and new.assigned_user_id = auth.uid()`, or the caller's
`crm_profiles.role = 'owner'` — raising `42501`. Note per that migration (`:22-34`): column-level
`REVOKE` is a **no-op** here; only a trigger works. Without it, §A/§B are defense-in-depth against the
*UI*, not against a crafted request.

## F. Suggested order

1. `assignAccount()` in `accounts/actions.ts` (§A)
2. `updateAccount()` gate + `CompanyDialog` `canAssign` prop (§B) — closes the hole the feature would otherwise leave open
3. `AssignmentControl.tsx` + `ProfileTopBar` / `DesktopProfile` / `page.tsx` prop threading (§C)
4. Mobile `RepBadge` unclaimed→Claim (§C, optional)
5. Decide on the DB trigger (§E)

## G. Verification limits

Browser verification of the finished feature will stop at the `/crm/login` redirect — no CRM
credentials are available in this environment (recurring limit). Expect `tsc` + `next build` as the
ceiling unless Brent tests it live.
