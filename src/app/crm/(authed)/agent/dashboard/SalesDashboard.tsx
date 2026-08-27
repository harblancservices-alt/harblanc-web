"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FileCard, SectionHead } from "../../accounts/[id]/desktop/file/chrome";
import { CompletenessList } from "../CompletenessList";
import { CommandHeader } from "./CommandHeader";
import { ArrivalsQueue, CallQueue, OverdueQueue } from "./WorkQueues";
import { groupAgentWork, newlyAssigned, type AgentTask, type AgentCompany } from "../agentWork";
import { buildSummary, workQueue } from "../dashboardSummary";
import { gapsForCompany, type CompletenessInput } from "../completeness";

/**
 * THE SALES DASHBOARD — an operations console, not an analytics page.
 *
 * Composition follows the reference top to bottom: dark command header with
 * the day in a sentence and five operational metrics, a create bar, three
 * work queues, then gaps and the week ahead.
 *
 * ── NOTHING HERE INVENTS DATA ─────────────────────────────────────────
 *
 * Every panel is fed from the rows the dashboard already loads, through
 * derivations that already existed: groupAgentWork for the queues,
 * newlyAssigned for triage, gapsForCompany for the gaps. No new data
 * structure, no analytics layer, no second definition of "overdue".
 *
 * And on the live data most of it is EMPTY. Brent has 4 companies and 3
 * open tasks; there are no overdue tasks anywhere in the org, and 27 of the
 * 31 open tasks have no due date at all. Every panel therefore has a
 * written empty state that says what would put something in it, because
 * that is the state Brent will actually see.
 *
 * ── THE ONE PLACE WITH NO SOURCE ──────────────────────────────────────
 *
 * The reference chips two gaps "BLOCKS QUALIFIED". There is no such gate:
 * updateLifecycleStatus moves a company to any stage at any time and
 * refuses exactly one thing, a terminal stage with no reason. That chip is
 * not rendered, for the same reason it was left off the company page.
 */

export function SalesDashboard({
  name,
  tasks,
  companies,
  completeness,
  callsToday,
  reachedToday,
  now,
  createBar,
}: {
  name: string;
  tasks: AgentTask[];
  companies: AgentCompany[];
  completeness: CompletenessInput[];
  callsToday: number;
  reachedToday: number;
  now: number;
  createBar: ReactNode;
}) {
  const nowDate = new Date(now);
  const groups = groupAgentWork(tasks, nowDate);
  const arrivals = newlyAssigned(companies);
  const summary = buildSummary({ tasks, companies, callsToday, reachedToday, now: nowDate });

  // Where the primary button goes: whatever the queue puts first. Built from
  // the same function that produced the count on it.
  const first = workQueue(tasks, companies, nowDate)[0] ?? null;
  const queueHref = first
    ? first.kind === "company"
      ? `/crm/accounts/${first.company.id}`
      : first.task.accountId
        ? `/crm/accounts/${first.task.accountId}`
        : "/crm/tasks"
    : null;

  // Phone and contact for the call queue, taken off the companies this agent
  // already owns rather than queried again.
  const phoneByAccount = new Map(companies.map((c) => [c.id, c.contactPhone]));
  const contactByAccount = new Map(companies.map((c) => [c.id, c.contactName]));

  // Gaps — the existing derivation, flattened to the shape CompletenessList
  // renders. Same rows the company page's panel 04 uses.
  const gaps = completeness.flatMap((c) => gapsForCompany(c));

  // The week ahead, grouped by day. Only DATED work can appear — an undated
  // task has no day to sit under, which is why the count below says so.
  const byDay = new Map<string, { label: string; day: string; tasks: AgentTask[] }>();
  for (const t of groups.thisWeek) {
    if (!t.dueAt) continue;
    const d = new Date(t.dueAt);
    const key = d.toLocaleDateString("en-US", { timeZone: "America/Chicago" });
    const entry =
      byDay.get(key) ?? {
        label: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Chicago" }),
        day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: "America/Chicago" }),
        tasks: [],
      };
    entry.tasks.push(t);
    byDay.set(key, entry);
  }
  const days = [...byDay.values()];

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <CommandHeader name={name} summary={summary} queueHref={queueHref} createBar={createBar} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {/* ── The three queues ─────────────────────────────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-stretch gap-3">
          <ArrivalsQueue companies={arrivals} />
          <CallQueue
            tasks={groups.today}
            phoneByAccount={phoneByAccount}
            contactByAccount={contactByAccount}
          />
          <OverdueQueue tasks={groups.overdue} nowMs={now} />
        </div>

        {/* ── Gaps and the week ────────────────────────────────────── */}
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-stretch gap-3">
          <FileCard className="flex flex-col">
            <SectionHead
              title="Gaps to fill"
              count={gaps.length === 0 ? "nothing missing" : `${gaps.length} across your companies`}
            />
            <div className="flex-1">
              {gaps.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] font-bold text-fg">Nothing missing</p>
                  <p className="mx-auto mt-1 max-w-[38ch] text-[12px] text-fg-subtle">
                    Every company you own has somebody to call, an address and a trade
                    on file.
                  </p>
                </div>
              ) : (
                // The same component the old dashboard used — fixable in
                // place, derived at read time, disappears when filled.
                <CompletenessList gaps={gaps} total={gaps.length} />
              )}
            </div>
          </FileCard>

          <FileCard className="flex flex-col">
            <SectionHead
              title="Next touches this week"
              count={
                days.length === 0
                  ? "nothing scheduled"
                  : `${groups.thisWeek.length} scheduled`
              }
            />
            <div className="flex-1 p-3">
              {days.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[13px] font-bold text-fg">Nothing booked past today</p>
                  <p className="mx-auto mt-1 max-w-[34ch] text-[12px] text-fg-subtle">
                    {tasks.filter((t) => t.dueAt === null).length > 0
                      ? `${tasks.filter((t) => t.dueAt === null).length} of your open tasks have no due date — give one a date and it appears here.`
                      : "Dated work for the rest of the week shows up here."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {days.map((d) => (
                    <div
                      key={`${d.label}-${d.day}`}
                      className="flex items-center gap-3 rounded-md border border-line bg-card p-2.5"
                    >
                      {/* The compact date block from the reference. */}
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-graphite text-white">
                        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/60">
                          {d.label}
                        </span>
                        <span className="text-[15px] font-extrabold leading-none crm-num">
                          {d.day}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {d.tasks.slice(0, 2).map((t) => (
                          <p key={t.id} className="truncate text-[12px] text-fg">
                            {t.accountId ? (
                              <Link
                                href={`/crm/accounts/${t.accountId}`}
                                prefetch={false}
                                className="font-semibold hover:text-accent hover:underline"
                              >
                                {t.companyName}
                              </Link>
                            ) : (
                              <span className="font-semibold">{t.title}</span>
                            )}
                            <span className="text-fg-subtle"> · {t.title}</span>
                          </p>
                        ))}
                      </div>
                      <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-subtle">
                        {d.tasks.length} {d.tasks.length === 1 ? "touch" : "touches"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </FileCard>
        </div>
      </div>
    </div>
  );
}
