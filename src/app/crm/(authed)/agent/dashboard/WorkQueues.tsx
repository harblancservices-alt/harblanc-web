"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileCard, SectionHead } from "../../accounts/[id]/desktop/file/chrome";
import { SourcePill } from "../../_shell/SourcePill";
import { CompleteTaskDialog } from "../../tasks/CompleteTaskDialog";
import { StageReasonDialog } from "../../accounts/StageReasonDialog";
import { snoozeTask } from "../../tasks/actions";
import { SNOOZE_PRESETS } from "../../tasks/snooze";
import { updateLifecycleStatus } from "../../accounts/actions";
import { digitsForTel } from "../../_shell/contactFields";
import { dueLabel, type AgentTask, type AgentCompany } from "../agentWork";
import type { CallListItem } from "../dashboardSummary";
import { daysLate } from "@/lib/crm/taskUrgency";

/**
 * THE THREE WORK QUEUES — triage, today's calls, and overdue.
 *
 * ── EVERY BUTTON IS THE EXISTING WORKFLOW ─────────────────────────────
 *
 * Nothing here is a new write path:
 *
 *   Open        a link to the company profile
 *   Not a fit   updateLifecycleStatus(id, "disqualified", reason) — and it
 *               PROMPTS, via the same StageReasonDialog the stage strip
 *               uses, because Disqualified is one of the two stages the
 *               server refuses without a reason. A one-click "Not a fit"
 *               that silently failed server-side would be worse than none.
 *   Done        the shared CompleteTaskDialog. completeTask requires a
 *               close-out note, enforced in the action, so a bare Done
 *               button would fail every time.
 *   Snooze      snoozeTask with the three presets from tasks/snooze.ts,
 *               which already handles the case that makes snooze confusing
 *               (an overdue task snoozed "tomorrow" lands tomorrow, not one
 *               day past a stale date).
 *   + phone     opens the company so the number can be added where the
 *   + contact   contact record lives. Not an inline field: a person is a
 *               name, a title, a number and an email.
 *
 * ── THE PHONE IS THE CONTROL ──────────────────────────────────────────
 *
 * Where a number exists it is a tel: link, not text — the row's whole
 * purpose is dialling it. Where it does not, the dashed placeholder says
 * which of the two things is missing, because "no phone on a known contact"
 * and "no contact at all" are different jobs.
 */

function ActionBtn({
  children,
  onClick,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-55 ${
        variant === "solid"
          ? "bg-accent text-white hover:bg-accent-hover"
          : "border border-line bg-card text-fg hover:bg-inset"
      }`}
    >
      {children}
    </button>
  );
}

/** The snooze control — collapsed to one button until it is wanted. */
function Snooze({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <ActionBtn variant="outline" onClick={() => setOpen(true)} disabled={pending}>
        Snooze
      </ActionBtn>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {SNOOZE_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await snoozeTask(taskId, p.key);
              setOpen(false);
              if (!res.ok) setError(res.error);
              else router.refresh();
            })
          }
          className="rounded-md border border-line bg-card px-2 py-1.5 text-[11.5px] font-semibold text-fg hover:bg-inset disabled:opacity-55"
        >
          {p.label}
        </button>
      ))}
      {error && <span className="text-[11px] font-semibold text-bad">{error}</span>}
    </span>
  );
}

/* ══════════════════ 1. NEW ARRIVALS — TRIAGE FIRST ══════════════════ */

export function ArrivalsQueue({
  companies,
  waiting = 0,
}: {
  companies: AgentCompany[];
  /** Never-contacted companies past the arrival window. Stated rather than
   * hidden: this column drains by design, and a company that aged out
   * silently would look like it had been dealt with. */
  waiting?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notAFit, setNotAFit] = useState<AgentCompany | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <FileCard className="flex min-h-0 flex-1 flex-col">
      <SectionHead
        title="New arrivals — triage first"
        count={
          companies.length === 0
            ? waiting > 0
              ? `nothing new · ${waiting} still untouched`
              : "nothing waiting"
            : waiting > 0
              ? `${companies.length} · ${waiting} older`
              : String(companies.length)
        }
      />
      {/* THE SCROLL REGION IS THE LIST, NOT THE CARD. The header above
          stays put; only the rows move under it.

          min-h-0 is the whole fix. A flex item defaults to
          min-height:auto, which refuses to shrink below its content — so
          with 28 tasks this body pushed the card, the row and the page
          taller instead of scrolling, which is what Brent saw: the middle
          column dwarfing the two beside it and the rest of his list below
          the fold. Same trap the company file hit.

          No overflow-hidden on the card itself, deliberately — that is
          what made a sticky child impossible on the assignment board. */}
      <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {error && (
          <p className="mb-2 rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
            {error}
          </p>
        )}

        {companies.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] font-bold text-fg">Nothing to triage</p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[12px] text-fg-subtle">
              New companies from the BOL Center or from an admin assignment land
              here before anybody has spoken to them.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {companies.map((c) => (
              <div key={c.id} className="rounded-md border border-line bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/crm/accounts/${c.id}`}
                    prefetch={false}
                    className="min-w-0 truncate text-[13px] font-extrabold text-fg hover:text-accent hover:underline"
                  >
                    {c.name}
                  </Link>
                  <SourcePill source={c.source} short />
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle">
                  {[
                    c.contactName ? `contact: ${c.contactName}` : "nobody to call yet",
                    [c.city, c.state].filter(Boolean).join(", ") || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/crm/accounts/${c.id}`}
                    prefetch={false}
                    className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-accent-hover"
                  >
                    Open →
                  </Link>
                  <ActionBtn variant="outline" onClick={() => setNotAFit(c)} disabled={pending}>
                    Not a fit
                  </ActionBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disqualified needs a reason and the server re-checks — the same
          gate the company page's stage strip goes through. */}
      <StageReasonDialog
        stage={notAFit ? "disqualified" : null}
        pending={pending}
        error={error}
        onCancel={() => {
          setNotAFit(null);
          setError(null);
        }}
        onConfirm={(reason) => {
          const target = notAFit;
          if (!target) return;
          setError(null);
          startTransition(async () => {
            const res = await updateLifecycleStatus(target.id, "disqualified", reason);
            if (res.ok) {
              setNotAFit(null);
              router.refresh();
            } else {
              setError(res.error);
            }
          });
        }}
      />
    </FileCard>
  );
}

/* ═════════════════════ 2. TODAY'S CALL QUEUE ════════════════════════ */

export function CallQueue({
  items,
  phoneByAccount,
  contactByAccount,
  nowMs,
}: {
  /** What to call TODAY, ordered by callList: overdue, then due today,
   * then undated. Undated is included deliberately — filtering to
   * due-today alone once left five of Brent's six tasks invisible on his
   * own dashboard. Work dated for a FUTURE day is excluded, so a snoozed
   * call actually leaves the list; see callList's note. */
  items: CallListItem[];
  /** The company's callable number, from the companies this agent owns. */
  phoneByAccount: Map<string, string | null>;
  contactByAccount: Map<string, string | null>;
  nowMs: number;
}) {
  const now = new Date(nowMs);
  return (
    <FileCard className="flex min-h-0 flex-1 flex-col">
      <SectionHead
        title="Your call list"
        count={
          items.length === 0
            ? "nothing open"
            : `${items.length} ${items.length === 1 ? "task" : "tasks"}`
        }
        action={
          <Link
            href="/crm/tasks"
            prefetch={false}
            className="text-[12px] text-fg-subtle hover:text-accent hover:underline"
          >
            all tasks
          </Link>
        }
      />
      {/* THE SCROLL REGION IS THE LIST, NOT THE CARD. The header above
          stays put; only the rows move under it.

          min-h-0 is the whole fix. A flex item defaults to
          min-height:auto, which refuses to shrink below its content — so
          with 28 tasks this body pushed the card, the row and the page
          taller instead of scrolling, which is what Brent saw: the middle
          column dwarfing the two beside it and the rest of his list below
          the fold. Same trap the company file hit.

          No overflow-hidden on the card itself, deliberately — that is
          what made a sticky child impossible on the assignment board. */}
      <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] font-bold text-fg">Nothing open</p>
            <p className="mx-auto mt-1 max-w-[36ch] text-[12px] text-fg-subtle">
              Every task assigned to you shows up here — late first, then
              dated, then the ones with no date yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map(({ task: t, band }) => {
              const phone = t.accountId ? phoneByAccount.get(t.accountId) ?? null : null;
              const contact = t.contactName ?? (t.accountId ? contactByAccount.get(t.accountId) ?? null : null);
              return (
                <div key={t.id} className="rounded-md border border-line bg-card p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-1.5">
                        {t.accountId ? (
                          <Link
                            href={`/crm/accounts/${t.accountId}`}
                            prefetch={false}
                            className="truncate text-[13px] font-extrabold text-fg hover:text-accent hover:underline"
                          >
                            {t.companyName}
                          </Link>
                        ) : (
                          <span className="text-[13px] font-extrabold text-fg">{t.title}</span>
                        )}
                        {contact && (
                          <span className="text-[11.5px] text-fg-subtle">· {contact}</span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-1.5 text-[11.5px]">
                        <span className="truncate text-fg-muted">{t.title}</span>
                        {/* WHEN, said once. dueLabel is the same function
                            the Tasks page and the Overdue column use, so a
                            row cannot read "3 days late" here and something
                            else there. Only late shouts. */}
                        <span
                          className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${
                            band === "overdue"
                              ? "bg-bad-bg text-bad"
                              : band === "today"
                                ? "bg-accent-bg text-accent"
                                : "text-fg-subtle"
                          }`}
                        >
                          {dueLabel(t.dueAt, now)}
                        </span>
                      </p>
                    </div>

                    {phone ? (
                      <a
                        href={`tel:${digitsForTel(phone)}`}
                        className="shrink-0 rounded-md border border-line bg-card px-3 py-1.5 text-[12.5px] font-bold text-fg transition-colors hover:border-accent hover:bg-accent-bg crm-num"
                      >
                        {phone}
                      </a>
                    ) : (
                      <Link
                        href={t.accountId ? `/crm/accounts/${t.accountId}` : "/crm/contacts"}
                        prefetch={false}
                        className="shrink-0 rounded-md border border-dashed border-line-strong px-4 py-1.5 text-[12px] font-semibold text-fg-subtle transition-colors hover:border-accent hover:text-accent"
                      >
                        {contact ? "+ phone" : "+ contact"}
                      </Link>
                    )}
                    <Snooze taskId={t.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FileCard>
  );
}

/* ══════════════════════════ 3. OVERDUE ══════════════════════════════ */

export function OverdueQueue({ tasks, nowMs }: { tasks: AgentTask[]; nowMs: number }) {
  const router = useRouter();
  const [closing, setClosing] = useState<AgentTask | null>(null);

  return (
    <FileCard className="flex min-h-0 flex-1 flex-col">
      <SectionHead
        title="Overdue"
        count={tasks.length === 0 ? "nothing late" : String(tasks.length)}
      />
      {/* THE SCROLL REGION IS THE LIST, NOT THE CARD. The header above
          stays put; only the rows move under it.

          min-h-0 is the whole fix. A flex item defaults to
          min-height:auto, which refuses to shrink below its content — so
          with 28 tasks this body pushed the card, the row and the page
          taller instead of scrolling, which is what Brent saw: the middle
          column dwarfing the two beside it and the rest of his list below
          the fold. Same trap the company file hit.

          No overflow-hidden on the card itself, deliberately — that is
          what made a sticky child impossible on the assignment board. */}
      <div className="crm-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] font-bold text-fg">Nothing is late</p>
            <p className="mx-auto mt-1 max-w-[32ch] text-[12px] text-fg-subtle">
              Tasks past their due date show up here with how far behind they are.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => {
              const late = daysLate(t.dueAt, new Date(nowMs));
              return (
                <div
                  key={t.id}
                  className="rounded-md border border-line border-l-[3px] border-l-bad bg-card p-3"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-bad">
                    {late !== null && late > 0 ? `${late} ${late === 1 ? "day" : "days"} late` : dueLabel(t.dueAt, new Date(nowMs))}
                  </p>
                  <p className="mt-0.5 text-[13px] font-extrabold leading-snug text-fg">{t.title}</p>
                  {t.accountId && (
                    <Link
                      href={`/crm/accounts/${t.accountId}`}
                      prefetch={false}
                      className="mt-0.5 block truncate text-[11.5px] text-accent hover:underline"
                    >
                      {t.companyName}
                    </Link>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <ActionBtn onClick={() => setClosing(t)}>Done</ActionBtn>
                    <Snooze taskId={t.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {closing && (
        <CompleteTaskDialog
          taskId={closing.id}
          title={closing.title}
          dueAt={closing.dueAt}
          definitionOfDone={closing.doneWhen}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            router.refresh();
          }}
        />
      )}
    </FileCard>
  );
}
