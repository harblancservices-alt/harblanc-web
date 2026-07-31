"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardHead, EmptyState, ZEBRA_ROWS } from "../_shell/ui";
import { IconCalendar } from "../_shell/icons";

export type CalendarItem = {
  id: string;
  type: "task" | "followup" | "call";
  /** "YYYY-MM-DD" — the Central calendar day this item lands on. */
  dateKey: string;
  sortMs: number;
  /** Formatted Central time, e.g. "Jul 30, 2026, 2:30 PM CST". */
  timeLabel: string;
  label: string;
  sub?: string;
  href: string;
  overdue: boolean;
};

// ---------------------------------------------------------------------------
// Pure, TZ-neutral date-grid helpers. `dateKey` is always a plain calendar
// date ("YYYY-MM-DD") already bucketed to Central time server-side (see
// centralDateKey in _shell/format.ts) — everything below just arranges those
// keys into a grid using UTC arithmetic on the Y/M/D triple, so it never
// touches a real timezone conversion itself.

function parseKey(key: string): { y: number; m0: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m0: m - 1, d };
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function toKey(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}
function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
function firstWeekday(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0, 1)).getUTCDay();
}
function shiftMonth(y: number, m0: number, delta: number): { y: number; m0: number } {
  const total = y * 12 + m0 + delta;
  return { y: Math.floor(total / 12), m0: ((total % 12) + 12) % 12 };
}
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Full Sun–Sat weeks spanning the month, padded with adjacent-month days. */
function monthMatrix(y: number, m0: number): string[][] {
  const first = firstWeekday(y, m0);
  const total = daysInMonth(y, m0);
  const prev = shiftMonth(y, m0, -1);
  const prevDays = daysInMonth(prev.y, prev.m0);
  const next = shiftMonth(y, m0, 1);

  const cells: string[] = [];
  for (let i = first - 1; i >= 0; i--) cells.push(toKey(prev.y, prev.m0, prevDays - i));
  for (let d = 1; d <= total; d++) cells.push(toKey(y, m0, d));
  let nd = 1;
  while (cells.length % 7 !== 0) cells.push(toKey(next.y, next.m0, nd++));

  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function formatDayHeading(key: string): string {
  const { y, m0, d } = parseKey(key);
  const wd = new Date(Date.UTC(y, m0, d)).getUTCDay();
  return `${WEEKDAY_LABELS[wd]}, ${MONTH_NAMES[m0].slice(0, 3)} ${d}, ${y}`;
}

// ---------------------------------------------------------------------------
// Color coding — fixed, theme-independent status tints (the CRM's core color
// rule; see calls/outcomes.ts), so the grid reads correctly on the light
// .crm-light card regardless of theme.

const TYPE_TONE: Record<CalendarItem["type"], { dot: string; chip: string; label: string }> = {
  task: { dot: "bg-steel", chip: "bg-steel-bg text-steel", label: "Task" },
  followup: { dot: "bg-warn", chip: "bg-warn-bg text-warn", label: "Follow-up" },
  call: { dot: "bg-ok", chip: "bg-ok-bg text-ok", label: "Call" },
};

function itemTone(item: CalendarItem): { dot: string; chip: string } {
  if (item.overdue) return { dot: "bg-bad", chip: "bg-bad-bg text-bad" };
  return TYPE_TONE[item.type];
}

/**
 * Company-wide calendar body — a month grid (desktop-first, but works on any
 * width) plus a Month/List toggle whose List mode is a day-grouped agenda,
 * the readable option on a phone. All month-navigation and day-selection
 * state lives here; `items`/`todayKey` are the only data crossing the
 * Server->Client boundary, both plain serializable values (see calendar/
 * page.tsx — no functions or component references cross that boundary,
 * matching nav.ts's buildCrmNav rule for this exact class of bug).
 */
export function CalendarView({ items, todayKey }: { items: CalendarItem[]; todayKey: string }) {
  const todayParts = parseKey(todayKey);
  const [view, setView] = useState({ y: todayParts.y, m0: todayParts.m0 });
  const [mode, setMode] = useState<"month" | "list">("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Default to the agenda list on a phone-width viewport — computed only
  // after mount so server/client markup still matches on first paint.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setMode("list");
  }, []);

  const itemsByDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const arr = m.get(it.dateKey);
      if (arr) arr.push(it);
      else m.set(it.dateKey, [it]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sortMs - b.sortMs);
    return m;
  }, [items]);

  const weeks = useMemo(() => monthMatrix(view.y, view.m0), [view]);
  const monthDayKeys = useMemo(() => {
    const total = daysInMonth(view.y, view.m0);
    const keys: string[] = [];
    for (let d = 1; d <= total; d++) keys.push(toKey(view.y, view.m0, d));
    return keys;
  }, [view]);
  const monthItemCount = monthDayKeys.reduce(
    (sum, k) => sum + (itemsByDay.get(k)?.length ?? 0),
    0,
  );

  const monthLabel = `${MONTH_NAMES[view.m0]} ${view.y}`;
  const isCurrentMonth = view.y === todayParts.y && view.m0 === todayParts.m0;

  const go = (delta: number) => {
    setView((v) => shiftMonth(v.y, v.m0, delta));
    setSelectedDay(null);
  };
  const goToday = () => {
    setView({ y: todayParts.y, m0: todayParts.m0 });
    setSelectedDay(todayKey);
  };

  const selectedItems = selectedDay ? itemsByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHead
          title="Calendar"
          hint={monthItemCount ? `${monthItemCount} item${monthItemCount === 1 ? "" : "s"} this month` : "Nothing scheduled this month"}
          right={<ModeToggle mode={mode} onChange={setMode} />}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong px-5 py-3">
          <div className="flex items-center gap-2">
            <NavButton onClick={() => go(-1)} label="Previous month">
              <Chevron dir="left" />
            </NavButton>
            <NavButton onClick={() => go(1)} label="Next month">
              <Chevron dir="right" />
            </NavButton>
            <h3 className="ml-1 min-w-[9.5rem] text-[15px] font-bold tabular-nums text-fg">
              {monthLabel}
            </h3>
            <button
              type="button"
              onClick={goToday}
              disabled={isCurrentMonth}
              className="ml-1 inline-flex h-8 items-center rounded-md border border-line-strong bg-card px-3 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-fg transition-colors hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
            >
              Today
            </button>
          </div>
          <Legend />
        </div>

        {mode === "month" ? (
          <div>
            <div className="grid grid-cols-7 border-b border-line-strong bg-inset">
              {WEEKDAY_LABELS.map((w) => (
                <div
                  key={w}
                  className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle"
                >
                  {w}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((key) => (
                  <DayCell
                    key={key}
                    dateKey={key}
                    inMonth={parseKey(key).m0 === view.m0}
                    isToday={key === todayKey}
                    isSelected={key === selectedDay}
                    dayItems={itemsByDay.get(key) ?? []}
                    onSelect={setSelectedDay}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <AgendaList dayKeys={monthDayKeys} itemsByDay={itemsByDay} todayKey={todayKey} />
        )}
      </Card>

      {mode === "month" && selectedDay && (
        <Card>
          <CardHead
            title={formatDayHeading(selectedDay)}
            hint={`${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`}
            right={
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="rounded-md px-2 py-1 text-[12px] font-medium text-bar-fg/70 transition-colors hover:text-bar-fg"
              >
                Close
              </button>
            }
          />
          {selectedItems.length === 0 ? (
            <EmptyState
              icon={<IconCalendar />}
              title="Nothing on this day"
              body="No tasks, follow-ups, or calls land on this day."
            />
          ) : (
            <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
              {selectedItems.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function DayCell({
  dateKey,
  inMonth,
  isToday,
  isSelected,
  dayItems,
  onSelect,
}: {
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dayItems: CalendarItem[];
  onSelect: (key: string) => void;
}) {
  const { d } = parseKey(dateKey);
  const visible = dayItems.slice(0, 3);
  const extra = dayItems.length - visible.length;

  return (
    <button
      type="button"
      onClick={() => onSelect(dateKey)}
      className={[
        "flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-line-strong p-1.5 text-left transition-colors last:border-r-0",
        inMonth ? "bg-card hover:bg-inset" : "bg-inset/60 hover:bg-inset",
        isSelected ? "ring-2 ring-inset ring-accent" : "",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums",
          isToday ? "bg-accent text-white" : inMonth ? "text-fg" : "text-fg-subtle",
        ].join(" ")}
      >
        {d}
      </span>
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        {visible.map((it) => (
          <span
            key={it.id}
            className={`truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight ${itemTone(it).chip}`}
          >
            {it.label}
          </span>
        ))}
        {extra > 0 && (
          <span className="text-[10px] font-medium text-fg-subtle">+{extra} more</span>
        )}
      </div>
    </button>
  );
}

function AgendaList({
  dayKeys,
  itemsByDay,
  todayKey,
}: {
  dayKeys: string[];
  itemsByDay: Map<string, CalendarItem[]>;
  todayKey: string;
}) {
  const nonEmpty = dayKeys.filter((k) => (itemsByDay.get(k) ?? []).length > 0);

  if (nonEmpty.length === 0) {
    return (
      <EmptyState
        icon={<IconCalendar />}
        title="Nothing this month"
        body="No tasks, follow-ups, or calls land in this month."
      />
    );
  }

  return (
    <div className="divide-y divide-line-strong">
      {nonEmpty.map((key) => (
        <div key={key}>
          <div
            className={`px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${
              key === todayKey ? "bg-accent/10 text-accent" : "bg-inset text-fg-subtle"
            }`}
          >
            {formatDayHeading(key)}
          </div>
          <ul className={`divide-y divide-line-strong ${ZEBRA_ROWS}`}>
            {(itemsByDay.get(key) ?? []).map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ItemRow({ item }: { item: CalendarItem }) {
  const tone = itemTone(item);
  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-fg/[0.04]"
      >
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-medium ${item.overdue ? "text-bad" : "text-fg"}`}>
            {item.label}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-fg-subtle">
            {item.timeLabel}
            {item.sub ? ` · ${item.sub}` : ""}
          </p>
        </div>
        {item.overdue && (
          <span className="mt-0.5 shrink-0 rounded-full bg-bad px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Overdue
          </span>
        )}
      </Link>
    </li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-fg-subtle">
      <LegendDot tone="bg-steel" label="Task" />
      <LegendDot tone="bg-warn" label="Follow-up" />
      <LegendDot tone="bg-ok" label="Call" />
      <LegendDot tone="bg-bad" label="Overdue" />
    </div>
  );
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "month" | "list";
  onChange: (mode: "month" | "list") => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-black/20 p-0.5">
      {(["month", "list"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={[
            "rounded-md px-3 py-1 text-[11.5px] font-semibold capitalize transition-colors",
            mode === m ? "bg-white text-fg" : "text-bar-fg/70 hover:text-bar-fg",
          ].join(" ")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function NavButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line-strong bg-card text-fg transition-colors hover:bg-inset"
    >
      {children}
    </button>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {dir === "left" ? <polyline points="15 6 9 12 15 18" /> : <polyline points="9 6 15 12 9 18" />}
    </svg>
  );
}
