"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "../../_lib/store";
import { Badge, Card, CardHead, PAGE_WIDTH, PageHeader, TEXT } from "../../_design/ui";

type DayEvent = { id: string; label: string; companyId: string | null; tone: "danger" | "accent" | "success" };

/** Simple month-grid calendar — task due dates + contact follow-ups plotted
 * by day. Kept intentionally light (no drag/resize/multi-view) since the
 * deliverable list needs a clickable calendar screen, not a scheduling
 * engine. */
export default function CalendarPage() {
  const { tasks, contacts, companies } = useStore();
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventsByDay = useMemo(() => {
    const map = new Map<number, DayEvent[]>();
    const push = (dateStr: string | null, ev: DayEvent) => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      map.set(day, [...(map.get(day) ?? []), ev]);
    };
    tasks.forEach((t) => push(t.dueAt, { id: `t-${t.id}`, label: t.title, companyId: t.companyId, tone: t.priority === "high" ? "danger" : "accent" }));
    contacts.forEach((c) =>
      push(c.nextFollowupAt, { id: `f-${c.id}`, label: `Follow up: ${c.name}`, companyId: c.companyId, tone: "success" }),
    );
    return map;
  }, [tasks, contacts, year, month]);

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader title="Calendar" subtitle="Task due dates and follow-ups across the org." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <CardHead title={monthLabel} />
          <div className="grid grid-cols-7 gap-px bg-[var(--cd-border)] text-center text-[10.5px] font-bold uppercase tracking-wide text-[var(--cd-text-muted)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-[var(--cd-surface-2)] py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-[var(--cd-border)]">
            {cells.map((day, i) => {
              const events = day ? (eventsByDay.get(day) ?? []) : [];
              const isToday = day === today.getDate();
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!day}
                  onClick={() => day && setSelectedDay(day)}
                  className={`flex min-h-[74px] flex-col items-start gap-1 bg-[var(--cd-surface)] p-1.5 text-left transition-colors ${
                    day ? "hover:bg-[var(--cd-accent-soft)]" : "bg-[var(--cd-surface-2)]"
                  } ${selectedDay === day ? "ring-2 ring-inset ring-[var(--cd-accent)]" : ""}`}
                >
                  {day && (
                    <>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? "bg-[var(--cd-accent)] text-white" : "text-[var(--cd-text-muted)]"}`}>
                        {day}
                      </span>
                      <div className="flex flex-wrap gap-0.5">
                        {events.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={`h-1.5 w-1.5 rounded-full ${
                              e.tone === "danger" ? "bg-[var(--cd-danger)]" : e.tone === "success" ? "bg-[var(--cd-success)]" : "bg-[var(--cd-accent)]"
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHead title={selectedDay ? `${monthLabel.split(" ")[0]} ${selectedDay}` : "Select a day"} hint={`${selectedEvents.length} events`} />
          {selectedEvents.length === 0 ? (
            <p className={`px-4 py-8 text-center ${TEXT.micro} text-[var(--cd-text-subtle)]`}>Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-[var(--cd-border)]">
              {selectedEvents.map((e) => {
                const company = companies.find((c) => c.id === e.companyId);
                return (
                  <li key={e.id} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={e.tone}>{e.tone === "danger" ? "High" : e.tone === "success" ? "Follow-up" : "Task"}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] font-medium text-[var(--cd-text)]">{e.label}</p>
                    {company && (
                      <Link href={`/crm-design/companies/${company.id}`} className={`${TEXT.micro} text-[var(--cd-accent)] hover:underline`}>
                        {company.name}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
