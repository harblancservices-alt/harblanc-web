"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, BTN_PRIMARY, BTN_NEUTRAL } from "../../_shell/ui";
import { FormError } from "../../_shell/form";
import { SegmentedTabs } from "../../_shell/SegmentedTabs";
import { lastContactStatus, titleCaseWords, upperCaseState } from "../../_shell/format";
import { SourcePill } from "../../_shell/SourcePill";
import { temperatureOf } from "@/lib/crm/temperature";
import { TemperatureDot } from "../../_shell/TemperatureDot";
import { stageLabel, stageTone } from "../../accounts/lifecycle";
import { assignCompanies } from "../assign-actions";
import { batchTaskSpec } from "./assignmentTask";
import type { CompanyAgent } from "./companies-data";
import {
  countByOwner,
  matchesOwner,
  sortForAdmin,
  UNASSIGNED,
  type CompanyRow,
} from "./companyRow";

/**
 * Admin → Companies — the management view of the entire company universe.
 *
 * Every crm_accounts row in the org, whoever owns it. The filter row leads
 * with UNASSIGNED because that is the admin's inbox: a company sitting there
 * is a company nobody is working.
 *
 * Same browse/select interaction as the assignment board — browse by default
 * with rows linking through to the profile, select mode for handing work out
 * — but a separate table, deliberately. See the report: the two share the
 * mode idiom and the selection rail (extracted to SelectionRail below and
 * used by both), and nothing else; their columns, filters, row identity and
 * assign targets are all different, so a shared table component would have
 * been a config object with two shapes rather than a reusable thing.
 */
export function CompaniesBoard({
  rows,
  agents,
  now,
}: {
  /** Server clock — never Date.now() during render (React Compiler purity
   * rule). One instant for every temperature in the table. */
  now: number;
  rows: CompanyRow[];
  agents: CompanyAgent[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>(UNASSIGNED);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** null = "use whatever the selection suggests"; a string = admin edited it. */
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  // NO DUE DATE AT ASSIGN TIME (Brent, 2026-08-25). The picker that used to
  // sit here is gone with it — assigned work lands UNDATED in the agent's
  // Inbox on Workspace → Tasks, and they drag it onto a day. Deciding when
  // something happens is the agent's job and the board is where they do it;
  // an admin guessing a date at hand-off just meant every assignment arrived
  // pre-planned into a day column and Inbox was never the destination it was
  // built to be.

  const sorted = useMemo(() => sortForAdmin(rows), [rows]);
  const counts = useMemo(() => countByOwner(rows, agents.map((a) => a.id)), [rows, agents]);
  const visible = useMemo(() => sorted.filter((r) => matchesOwner(r, filter)), [sorted, filter]);

  const visibleIds = visible.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Scoped to what is ON SCREEN — ticking the header under a filter must
   * never quietly select rows the filter is hiding. */
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelected(new Set());
      return !prev;
    });
    setError(null);
    setNotice(null);
  }

  function handOff(agent: CompanyAgent) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await assignCompanies(agent.id, ids, {
        title: taskTitle,
        taskType: spec.taskType,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(new Set());
      // Say exactly what happened, including what was SKIPPED — a silent
      // duplicate-guard looks like a failed write.
      const parts = [
        `${result.claimed} ${result.claimed === 1 ? "company" : "companies"} now owned by ${agent.name}`,
      ];
      if (result.tasked > 0) parts.push(`${result.tasked} ${result.tasked === 1 ? "task" : "tasks"} created`);
      if (result.alreadyHadTask > 0)
        parts.push(
          `${result.alreadyHadTask} already had this task, so ${result.alreadyHadTask === 1 ? "it was" : "they were"} left alone`,
        );
      if (result.movedTasks > 0)
        parts.push(`${result.movedTasks} existing ${result.movedTasks === 1 ? "task" : "tasks"} moved across`);
      setNotice(`${parts.join(" · ")}.${result.warning ? ` ${result.warning}` : ""}`);
      router.refresh();
    });
  }

  const selectedCount = selected.size;

  /**
   * The task the assignment will create. Derived from what the selected
   * companies actually are (source + stage), defaulted a few days out, and
   * BOTH shown and editable before confirming — the admin is never made to
   * pick, but is never left guessing what was picked for them either.
   *
   * Recomputed from the selection rather than held in state, so changing the
   * selection updates the suggestion; the admin's own edits are held in
   * titleOverride and survive it.
   */
  // Computed plainly, NOT via useMemo. The dependency would be `selected`, a
  // Set — a mutable reference the React Compiler cannot prove stable, so a
  // manual memo here makes it skip optimising this whole component. The work
  // is a filter over at most a few dozen rows; the memo bought nothing.
  // Stage only — `source` stopped deciding the task on 2026-08-26 (see
  // assignmentTask.ts). Where a company came from is provenance; where it IS
  // determines what to do next.
  const spec = batchTaskSpec(rows.filter((r) => selected.has(r.id)).map((r) => ({ stage: r.stage })));
  const taskTitle = titleOverride ?? spec.title;

  // Unassigned first and loudest, then All, then one tab per agent.
  const filterItems = [
    {
      key: UNASSIGNED,
      label: "Unassigned",
      active: filter === UNASSIGNED,
      onSelect: () => setFilter(UNASSIGNED),
      count: counts[UNASSIGNED] ?? 0,
      // The only tab that ever carries a dot: an unowned company is the one
      // state on this screen that needs somebody to act.
      countNeedsAttention: true,
    },
    {
      key: "all",
      label: "All",
      active: filter === "all",
      onSelect: () => setFilter("all"),
      count: counts.all ?? 0,
    },
    ...agents.map((a) => ({
      key: a.id,
      label: a.name,
      active: filter === a.id,
      onSelect: () => setFilter(a.id),
      count: counts[a.id] ?? 0,
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex max-h-[calc(100vh-9rem)] flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-bold tracking-tight text-fg">Companies</h2>
          <p className="text-[12.5px] text-fg-muted">
            {rows.length} in the org · {counts[UNASSIGNED] ?? 0} with no owner
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <SegmentedTabs ariaLabel="Company owner" items={filterItems} />
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12px] text-fg-subtle">Unowned first, then coldest</p>
            <button
              type="button"
              onClick={toggleSelectMode}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                selectMode ? BTN_NEUTRAL : BTN_PRIMARY
              }`}
            >
              {selectMode ? "Cancel" : "Select to assign"}
            </button>
          </div>
        </div>

        {notice && (
          <p className="border-y border-line bg-ok-bg px-4 py-2 text-[12.5px] font-semibold text-fg">{notice}</p>
        )}
        {error && (
          <div className="px-4 pt-2">
            <FormError message={error} />
          </div>
        )}

        {visible.length === 0 ? (
          <div className="px-4 pb-8 pt-4 text-center">
            <p className="text-[13.5px] font-semibold text-fg">Nothing here</p>
            <p className="mt-0.5 text-[12.5px] text-fg-muted">
              {filter === UNASSIGNED
                ? "Every company in the org has an owner."
                : "No companies under this filter."}
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-bold uppercase tracking-[0.07em] text-fg-muted">
                  {/* Gutter reserved in BOTH modes so the list never shifts
                      sideways when select mode turns on — same rule as the
                      assignment board, and the same reason. */}
                  <th className="w-12 px-4 py-2">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select every company shown"
                        className="h-4 w-4 cursor-pointer accent-[#2f5fd6]"
                      />
                    )}
                  </th>
                  <th className="px-2 py-2 text-left">Company</th>
                  <th className="px-2 py-2 text-left">Owner</th>
                  <th className="px-2 py-2 text-left">Source</th>
                  <th className="px-2 py-2 text-left">Stage</th>
                  <th className="px-2 py-2 text-left">Last activity</th>
                  <th className="px-2 py-2 text-left">Open work</th>
                  <th className="w-28 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const checked = selected.has(row.id);
                  const contact = lastContactStatus(row.lastContactMs);
                  const temp = temperatureOf({ stage: row.stage, lastContactMs: row.lastContactMs, now });
                  const href = `/crm/accounts/${row.id}`;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => (selectMode ? toggle(row.id) : router.push(href))}
                      className={`group cursor-pointer border-b border-line transition-colors ${
                        checked ? "bg-accent-bg" : "hover:bg-accent-bg"
                      }`}
                    >
                      <td
                        className="w-12 px-4 py-2.5"
                        onClick={selectMode ? (e) => e.stopPropagation() : undefined}
                      >
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(row.id)}
                            aria-label={`Select ${row.name}`}
                            className="h-4 w-4 cursor-pointer accent-[#2f5fd6]"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <p className="text-[13px] font-semibold text-fg">{titleCaseWords(row.name)}</p>
                        {(row.city || row.state) && (
                          <p className="text-[11.5px] text-fg-subtle">
                            {[row.city ? titleCaseWords(row.city) : null, upperCaseState(row.state)]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px]">
                        {row.ownerName ? (
                          <span className="text-fg">{row.ownerName}</span>
                        ) : (
                          <span className="font-semibold text-[#c0272d]">Unassigned</span>
                        )}
                      </td>
                      {/* Verbatim for anything unrecognised — the admin needs
                          to see the actual junk to clean it up. */}
                      <td className="px-2 py-2.5">
                        <SourcePill source={row.source} />
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${stageTone(row.stage)}`}
                        >
                          {stageLabel(row.stage)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-fg-muted">
                        <span className="flex items-center gap-1.5">
                          <TemperatureDot temp={temp} />
                          {contact.freshness === "never" ? "Never" : contact.text}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px] text-fg-muted">
                        {row.openWork > 0 ? row.openWork : "—"}
                      </td>
                      <td
                        className="w-28 px-2 py-2.5 text-right"
                        onClick={selectMode ? undefined : (e) => e.stopPropagation()}
                      >
                        {!selectMode && (
                          <Link
                            href={href}
                            prefetch={false}
                            className="invisible whitespace-nowrap text-[12px] font-semibold text-accent underline-offset-2 hover:underline group-hover:visible"
                          >
                            Open &rsaquo;
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedCount > 0 && (
          <div className="flex shrink-0 flex-col gap-2.5 bg-[#111418] px-4 py-3">
            {/* The task is shown BEFORE confirming, not chosen silently: the
                admin can see and change both the title and the due date, and
                only then picks who gets it. */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-bold text-white">{selectedCount} selected</span>
              <label className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Task</span>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTitleOverride(e.target.value)}
                  aria-label="Task title"
                  className="min-w-[16rem] rounded-md border border-white/25 bg-white/10 px-2.5 py-1.5 text-[12.5px] font-medium text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
                />
              </label>
              <span className="text-[11.5px] text-white/50">
                lands undated in their Inbox
              </span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-auto text-[12.5px] font-semibold text-white underline underline-offset-2 hover:text-white/80"
              >
                clear
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-white/60">Hand to</span>
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={pending || !taskTitle.trim()}
                  onClick={() => handOff(a)}
                  className="rounded-md border border-white/25 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {pending ? "Assigning…" : a.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
