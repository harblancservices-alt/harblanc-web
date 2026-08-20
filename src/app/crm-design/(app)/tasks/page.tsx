"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore, useTeamMemberById } from "../../_lib/store";
import { Badge, Card, CardHead, EmptyState, PAGE_WIDTH, PageHeader, TEXT } from "../../_design/ui";
import { firstName, relativeTime } from "../../_lib/format";
import { IconCheck, IconTasks } from "../../_design/icons";
import type { TaskItem } from "../../_lib/types";

export default function TasksPage() {
  const { tasks, toggleTask } = useStore();

  const groups = useMemo(() => {
    const now = Date.now();
    const open = tasks.filter((t) => t.status === "open");
    const done = tasks.filter((t) => t.status === "done");
    const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now && new Date(t.dueAt).toDateString() !== new Date().toDateString());
    const dueToday = open.filter((t) => t.dueAt && new Date(t.dueAt).toDateString() === new Date().toDateString());
    const upcoming = open.filter((t) => !overdue.includes(t) && !dueToday.includes(t));
    return { overdue, dueToday, upcoming, done };
  }, [tasks]);

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader title="Tasks" subtitle="Every open task across the org, grouped by urgency." />

      {tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<IconTasks />} title="No tasks yet" body="Tasks created from a company profile or the dashboard will show up here." />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <TaskGroup title="Overdue" tone="danger" items={groups.overdue} onToggle={toggleTask} />
          <TaskGroup title="Due today" tone="accent" items={groups.dueToday} onToggle={toggleTask} />
          <TaskGroup title="Upcoming" tone="neutral" items={groups.upcoming} onToggle={toggleTask} />
          <TaskGroup title="Completed" tone="success" items={groups.done} onToggle={toggleTask} collapsedByDefault />
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  title,
  tone,
  items,
  onToggle,
  collapsedByDefault,
}: {
  title: string;
  tone: "danger" | "accent" | "neutral" | "success";
  items: TaskItem[];
  onToggle: (id: string) => void;
  collapsedByDefault?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHead title={title} hint={`${items.length}`} right={<Badge tone={tone}>{title}</Badge>} />
      <details open={!collapsedByDefault}>
        <summary className={collapsedByDefault ? `cursor-pointer px-4 py-2 ${TEXT.micro} font-semibold text-[var(--cd-accent)]` : "hidden"}>
          {collapsedByDefault ? "Show completed" : ""}
        </summary>
        <ul className="divide-y divide-[var(--cd-border)]">
          {items.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} />
          ))}
        </ul>
      </details>
    </Card>
  );
}

function TaskRow({ task, onToggle }: { task: TaskItem; onToggle: () => void }) {
  const { companies } = useStore();
  const company = companies.find((c) => c.id === task.companyId);
  const assignee = useTeamMemberById(task.assignedUserId);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          task.status === "done"
            ? "border-[var(--cd-success)] bg-[var(--cd-success)] text-white"
            : "border-[var(--cd-border-strong)] text-transparent hover:border-[var(--cd-accent)] hover:text-[var(--cd-accent)]"
        }`}
      >
        <IconCheck width={12} height={12} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13.5px] font-semibold ${task.status === "done" ? "text-[var(--cd-text-subtle)] line-through" : "text-[var(--cd-text)]"}`}>
          {task.title}
        </p>
        <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>
          {company ? (
            <Link href={`/crm-design/companies/${company.id}`} className="hover:text-[var(--cd-accent)]">
              {company.name}
            </Link>
          ) : (
            "No company"
          )}
          {" · "}
          {firstName(assignee?.name ?? "Unassigned")}
          {task.dueAt && <> · {relativeTime(task.dueAt)}</>}
        </p>
      </div>
      {task.priority === "high" && task.status === "open" && <Badge tone="danger">High</Badge>}
    </li>
  );
}
