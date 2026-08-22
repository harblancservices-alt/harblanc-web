import Link from "next/link";
import { Card, CardHead } from "./_shell/ui";
import { ClickableListItem } from "./_shell/ClickableRow";
import { CompanyAvatar } from "./_shell/InitialAvatar";
import { NbaTaskAction } from "./NbaTaskAction";
import { NbaClaimAction } from "./NbaClaimAction";
import { NbaAddContactAction } from "./NbaAddContactAction";
import { TaskRow, type CrmTaskItem } from "./tasks/TaskRow";
import type { TaskDefaults, TaskContactOption, TaskAccountOption } from "./tasks/TaskDialog";
import type { RepOption } from "./accounts/CompanyDialog";
import type { CompanyOption } from "./contacts/CompanyCombobox";

export type NbaItem = {
  id: string;
  /** Row navigates here on click (account profile, or a contact/task
   * fallback when there's no account). */
  href: string;
  /** First-letter avatar label — the company name, or the contact's name
   * when the item has no company. */
  avatarLabel: string;
  companyName: string | null;
  /** e.g. "Researching · stale 6d" / "18% profile complete". */
  reason: string;
  tag: "OVERDUE" | "STALE" | "WIN-BACK" | null;
  action:
    /** REACH BACK OUT is deliberately plain navigation (to the company
     * profile) rather than another task offer — the win-back task was
     * already lazily created server-side (page.tsx's dueWinbackAccounts);
     * a second pill offering to create one would just duplicate it. */
    | { kind: "link"; label: "CALL" | "EMAIL" | "REACH BACK OUT"; href: string }
    /** Opens a pre-filled TaskDialog instead of navigating — see
     * NbaTaskAction.tsx. Label reflects the account's stage (or the
     * research-gap tier, which isn't stage-specific) so the pill's promise
     * matches what it actually creates. */
    | { kind: "task"; label: "RESEARCH" | "REACH OUT" | "FOLLOW UP" | "FOLLOW UP ON QUOTE"; defaults: TaskDefaults }
    /** An unclaimed New Lead's pill — claims it in one click (assign +
     * advance to Researching + fire that stage's entry task). See
     * NbaClaimAction.tsx. */
    | { kind: "claim"; label: "CLAIM"; accountId: string }
    /** A no-contacts-yet company's pill — opens the same AddContactDialog
     * the Companies list uses, pre-attached to this company. See
     * NbaAddContactAction.tsx. */
    | { kind: "add-contact"; label: "ADD CONTACT"; accountId: string; accountName: string }
    | null;
};

const TAG_TONE: Record<NonNullable<NbaItem["tag"]>, string> = {
  OVERDUE: "bg-bad-bg text-bad",
  STALE: "bg-warn-bg text-warn",
  "WIN-BACK": "bg-steel-bg text-steel",
};

type ActionLabel = NonNullable<NbaItem["action"]>["label"];

const ACTION_PILL_TONE: Record<ActionLabel, string> = {
  CALL: "bg-accent text-white hover:bg-accent-hover",
  EMAIL: "bg-accent text-white hover:bg-accent-hover",
  CLAIM: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
  "REACH OUT": "border border-steel/40 bg-steel-bg text-steel hover:bg-steel/10",
  "FOLLOW UP": "border border-warn/40 bg-warn-bg text-warn hover:bg-warn/10",
  "FOLLOW UP ON QUOTE": "border border-warn/40 bg-warn-bg text-warn hover:bg-warn/10",
  RESEARCH: "border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#7c3aed] hover:bg-[#7c3aed]/20",
  "ADD CONTACT": "border border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#7c3aed] hover:bg-[#7c3aed]/20",
  "REACH BACK OUT": "border border-line-strong bg-inset text-fg-muted hover:bg-card",
};

/**
 * NEXT BEST ACTION — the dashboard's primary, widest column: one ranked queue
 * mixing real crm_tasks with the org-wide signal tiers (going-stale accounts,
 * Lost win-backs, research gaps, no-contact companies — page.tsx builds and
 * tiers them; see the comment there for the exact ordering rule).
 *
 * TWO row shapes, deliberately:
 *
 *   1. REAL TASKS render the shared Style-C TaskRow card — the same card the
 *      global Tasks page, the company profile and the contact profile use. The
 *      dashboard used to render its own flattened row here with only a CALL/
 *      EMAIL pill, which meant a task could not be COMPLETED from the
 *      dashboard at all (TASK_CARD_AUDIT.md §4.1): a rep called off the queue
 *      and then had to go find the task somewhere else to close it. The card
 *      brings its Done / Log call / Snooze / ⋯ row with it.
 *   2. SIGNAL ROWS (stale / win-back / research / no-contact) keep their
 *      existing compact stage-aware pill row unchanged — they aren't tasks,
 *      there's nothing to complete, and their whole value is being scannable.
 *
 * The two blocks are rendered separately rather than interleaved in one
 * `divide-y` list: task cards carry their own border, and a `divide-y` no-ops
 * against children that set their own border-color. Ordering is unaffected —
 * every task tier already outranks every signal tier, so tasks-then-signals IS
 * the ranked order.
 *
 * Deliberately a plain Server Component: TaskRow and every pill kind is a
 * Client Component receiving only plain, serializable props (tasks/contacts/
 * reps/currentUser/companies, all already fetched by the Dashboard) — never a
 * function prop from this Server Component, so this doesn't cross the RSC
 * boundary that's bitten this page before.
 */
export function NextBestActionSection({
  tasks,
  items,
  mobileVisibleCount,
  contacts,
  accounts,
  reps,
  canAssignOthers,
  currentUser,
  companies,
}: {
  /** Real crm_tasks rows, already tiered/sorted by the caller (overdue first,
   * then due-today, each by due date then priority). */
  tasks: CrmTaskItem[];
  /** The non-task signal tiers, in rank order. */
  items: NbaItem[];
  /** Entries beyond this index (counted across tasks THEN items, i.e. the
   * combined ranked order) stay in the DOM for search/print/tab order but are
   * visually hidden below `lg` — the mockup's mobile "top ~4" cap. */
  mobileVisibleCount?: number;
  /** Org-wide roster, already fetched by the Dashboard — threaded through to
   * NbaTaskAction and to each TaskRow's edit dialog so neither needs its own
   * per-row fetch. */
  contacts: TaskContactOption[];
  /** Company picker options for a task card's edit dialog (a dashboard task's
   * company isn't fixed the way it is inside a company profile). */
  accounts: TaskAccountOption[];
  reps: RepOption[];
  canAssignOthers: boolean;
  currentUser: { id: string; label: string };
  /** Org-wide company roster — threaded through to NbaAddContactAction's
   * AddContactDialog for the same reason (no per-row fetch). */
  companies: CompanyOption[];
}) {
  const total = tasks.length + items.length;
  /** How many of the mobile-visible slots the task block has already used, so
   * the signal rows below continue the same count rather than restarting it. */
  const taskSlots = mobileVisibleCount === undefined ? 0 : Math.min(tasks.length, mobileVisibleCount);

  return (
    <Card>
      <CardHead title="Next Best Action" hint={total ? `${total} to work` : "Nothing urgent"} />
      {total === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-fg-muted">
          Nothing needs action right now. Every account is on track.
        </p>
      ) : (
        <>
          {tasks.length > 0 && (
            <ul className="grid grid-cols-1 items-start gap-2.5 p-3 sm:grid-cols-2">
              {tasks.map((task, idx) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  showCompany
                  accounts={accounts}
                  contacts={contacts}
                  reps={reps}
                  canAssignOthers={canAssignOthers}
                  currentUser={currentUser}
                  {...(mobileVisibleCount !== undefined && idx >= mobileVisibleCount
                    ? { className: "hidden lg:flex" }
                    : {})}
                />
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <ul className={`divide-y divide-line-strong ${tasks.length > 0 ? "border-t border-line-strong" : ""}`}>
              {items.map((item, idx) => {
                const hiddenOnMobile =
                  mobileVisibleCount !== undefined && taskSlots + idx >= mobileVisibleCount;
                return (
                  <ClickableListItem
                    key={item.id}
                    href={item.href}
                    className={`items-start gap-3 px-4 py-3 ${hiddenOnMobile ? "hidden lg:flex" : "flex"}`}
                  >
                    <CompanyAvatar name={item.avatarLabel} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={item.href}
                          prefetch={false}
                          className="truncate text-[14px] font-semibold text-fg hover:underline"
                        >
                          {item.companyName || item.avatarLabel}
                        </Link>
                        {item.tag && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TAG_TONE[item.tag]}`}>
                            {item.tag}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-fg-muted">{item.reason}</p>
                    </div>
                    {item.action?.kind === "link" && (
                      <a
                        href={item.action.href}
                        className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold transition-colors ${ACTION_PILL_TONE[item.action.label]}`}
                      >
                        {item.action.label}
                      </a>
                    )}
                    {item.action?.kind === "task" && (
                      <NbaTaskAction
                        label={item.action.label}
                        defaults={item.action.defaults}
                        contacts={contacts}
                        reps={reps}
                        canAssignOthers={canAssignOthers}
                        currentUser={currentUser}
                        className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold transition-colors ${ACTION_PILL_TONE[item.action.label]}`}
                      />
                    )}
                    {item.action?.kind === "claim" && (
                      <NbaClaimAction
                        accountId={item.action.accountId}
                        label={item.action.label}
                        className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold transition-colors ${ACTION_PILL_TONE[item.action.label]}`}
                      />
                    )}
                    {item.action?.kind === "add-contact" && (
                      <NbaAddContactAction
                        accountId={item.action.accountId}
                        accountName={item.action.accountName}
                        companies={companies}
                        label={item.action.label}
                        className={`inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[11.5px] font-bold transition-colors ${ACTION_PILL_TONE[item.action.label]}`}
                      />
                    )}
                  </ClickableListItem>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
