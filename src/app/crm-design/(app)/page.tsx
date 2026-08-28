"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "../_lib/store";
import { Badge, Button, Card, CardHead, EmptyState, PAGE_WIDTH, PageHeader, TEXT } from "../_design/ui";
import { firstName, relativeTime } from "../_lib/format";
import { IconActivity, IconBuilding, IconCalendar, IconCheck, IconFlame, IconPhone, IconPlus, IconTasks } from "../_design/icons";
import { AddCompanyDrawer } from "../_shared/AddCompanyDrawer";
import { computeActionItems, type ActionItem, type ActionItemReasonTone } from "../_lib/actionItems";

const REASON_TONE_CLASS: Record<ActionItemReasonTone, string> = {
  danger: "bg-[var(--cd-danger-soft)] text-[var(--cd-danger)]",
  accent: "bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]",
  warning: "bg-[var(--cd-warning-soft)] text-[var(--cd-warning)]",
  neutral: "bg-[var(--cd-surface-2)] text-[var(--cd-text-muted)]",
};

const TASK_KINDS = new Set(["overdue", "due_today", "due_soon"]);

export default function DashboardPage() {
  const { companies, tasks, activities, prospects, currentUser, toggleTask } = useStore();
  const [addOpen, setAddOpen] = useState(false);

  // One instant for the whole render, read once at mount. Calling Date.now()
  // or new Date() during render is the React Compiler purity error: the
  // compiler may cache or replay a render, so two values computed from
  // separate clock reads can disagree about what "now" is. All four counters
  // below now measure against the same moment.
  const [nowMs] = useState(() => Date.now());
  const todayKey = new Date(nowMs).toDateString();

  // Auto-computed and ranked — no manual priority tagging drives this order.
  // See _lib/actionItems.ts for the signals (overdue > due today > going
  // stale > new prospect > due soon) and how each is scored.
  const actionItems = useMemo(
    () => computeActionItems({ tasks, companies, activities, prospects, currentUser }).slice(0, 8),
    [tasks, companies, activities, prospects, currentUser],
  );

  const overdue = tasks.filter((t) => t.status === "open" && t.dueAt && new Date(t.dueAt).getTime() < nowMs).length;
  const dueToday = tasks.filter((t) => t.status === "open" && t.dueAt && new Date(t.dueAt).toDateString() === todayKey).length;
  const activeCustomers = companies.filter((c) => c.stage === "active_customer").length;
  const newThisWeek = companies.filter((c) => nowMs - new Date(c.createdAt).getTime() < 7 * 86_400_000).length;

  // Personal, not org-wide (Brent's call): "jump back to what I just did,"
  // not a firehose of everyone's activity. The full org-wide feed still
  // exists at /crm-design/activities (unlinked from primary nav now, but
  // still a working deep link) for anyone who wants the whole picture.
  const recentActivity = useMemo(
    () => activities.filter((a) => a.authorId === currentUser.id).slice(0, 8),
    [activities, currentUser.id],
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className={PAGE_WIDTH}>
      <PageHeader
        title={`${greeting}, ${firstName(currentUser.name)}`}
        subtitle={
          overdue > 0
            ? `${overdue} overdue, ${dueToday} due today.`
            : dueToday > 0
              ? `${dueToday} due today. Nothing overdue.`
              : "All caught up. Nothing urgent right now."
        }
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconPlus width={15} height={15} /> Add company
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Overdue" value={overdue} tone="danger" href="/crm-design/tasks" />
        <KpiTile label="Due Today" value={dueToday} tone="accent" href="/crm-design/tasks" />
        <KpiTile label="Active Customers" value={activeCustomers} tone="success" href="/crm-design/active-clients" />
        <KpiTile label="New This Week" value={newThisWeek} tone="neutral" href="/crm-design/companies" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHead title="Your next best actions" hint={`${actionItems.length} action${actionItems.length === 1 ? "" : "s"}`} />
          {actionItems.length === 0 ? (
            <EmptyState
              icon={<IconCheck />}
              title="Nothing needs your attention"
              body="Overdue and due-today tasks, accounts going quiet, and new prospects with no first contact will show up here, ranked automatically."
            />
          ) : (
            <ul className="divide-y divide-[var(--cd-border)]">
              {actionItems.map((item) => (
                <ActionRow key={item.id} item={item} onToggleTask={toggleTask} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead
            title="Recent activity"
            hint="Yours"
            right={<Link href="/crm-design/activities" className={`${TEXT.micro} font-semibold text-[var(--cd-accent)]`}>View org-wide</Link>}
          />
          {recentActivity.length === 0 ? (
            <EmptyState icon={<IconActivity />} title="Nothing logged yet" body="Your own calls, notes, and stage changes will show up here — jump back to what you just did." />
          ) : (
            <ul className="divide-y divide-[var(--cd-border)]">
              {recentActivity.map((a) => (
                <ActivityRow key={a.id} companyId={a.companyId} contactId={a.contactId} title={a.title} occurredAt={a.occurredAt} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickLink href="/crm-design/companies" icon={<IconBuilding width={18} height={18} />} label="Companies" sub={`${companies.length} total`} />
        <QuickLink href="/crm-design/calendar" icon={<IconCalendar width={18} height={18} />} label="Calendar" sub="This week's follow-ups" />
        <QuickLink href="/crm-design/tasks" icon={<IconTasks width={18} height={18} />} label="Tasks" sub={`${tasks.filter((t) => t.status === "open").length} open`} />
      </div>

      <AddCompanyDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function KpiTile({ label, value, tone, href }: { label: string; value: number; tone: "danger" | "accent" | "success" | "neutral"; href: string }) {
  const toneColor: Record<string, string> = {
    danger: "text-[var(--cd-danger)]",
    accent: "text-[var(--cd-accent)]",
    success: "text-[var(--cd-success)]",
    neutral: "text-[var(--cd-text)]",
  };
  return (
    <Link href={href}>
      <Card className="p-4 transition-shadow hover:shadow-[var(--cd-shadow-lg)]">
        <p className={`${TEXT.label} text-[var(--cd-text-muted)]`}>{label}</p>
        <p className={`mt-1.5 font-mono text-[26px] font-bold leading-none tabular-nums ${toneColor[tone]}`}>{value}</p>
      </Card>
    </Link>
  );
}

/**
 * Renders every kind the auto-priority engine produces. Task-backed kinds
 * (overdue/due_today/due_soon) keep the checkbox-complete behavior; the
 * synthesized kinds (stale/new_prospect) aren't tasks — no checkbox, the
 * whole row is a link straight to the company instead.
 */
function ActionRow({ item, onToggleTask }: { item: ActionItem; onToggleTask: (taskId: string) => void }) {
  const isTask = TASK_KINDS.has(item.kind);

  const leading = isTask ? (
    <button
      type="button"
      onClick={() => item.taskId && onToggleTask(item.taskId)}
      aria-label="Complete task"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--cd-border-strong)] text-transparent transition-colors hover:border-[var(--cd-accent)] hover:text-[var(--cd-accent)]"
    >
      <IconCheck width={12} height={12} />
    </button>
  ) : (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]">
      {item.kind === "stale" ? <IconPhone width={11} height={11} /> : <IconFlame width={11} height={11} />}
    </span>
  );

  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-[var(--cd-text)]">{item.title}</p>
        {item.companyName &&
          (isTask && item.href ? (
            <Link
              href={item.href}
              onClick={(e) => e.stopPropagation()}
              className={`${TEXT.micro} text-[var(--cd-text-muted)] hover:text-[var(--cd-accent)]`}
            >
              {item.companyName}
            </Link>
          ) : (
            <p className={`${TEXT.micro} text-[var(--cd-text-muted)]`}>{item.companyName}</p>
          ))}
      </div>
      {item.priority === "high" && <Badge tone="danger">High</Badge>}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${REASON_TONE_CLASS[item.reasonTone]}`}>
        {item.reason}
      </span>
    </>
  );

  if (isTask) {
    return <li className="flex items-center gap-3 px-4 py-3">{body}</li>;
  }
  return (
    <li>
      <Link href={item.href ?? "#"} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--cd-surface-hover)]">
        {body}
      </Link>
    </li>
  );
}

function ActivityRow({ companyId, contactId, title, occurredAt }: { companyId: string | null; contactId: string | null; title: string; occurredAt: string }) {
  const { companies, contacts } = useStore();
  const company = companies.find((c) => c.id === companyId);
  const contact = !company ? contacts.find((c) => c.id === contactId) : null;
  const href = company ? `/crm-design/companies/${company.id}` : contact ? `/crm-design/contacts/${contact.id}` : null;
  const recordLabel = company?.name ?? contact?.name ?? null;

  const body = (
    <>
      <p className="truncate text-[13px] font-medium text-[var(--cd-text)]">{title}</p>
      <p className={`${TEXT.micro} ${href ? "text-[var(--cd-text-muted)]" : "text-[var(--cd-text-subtle)]"}`}>
        {recordLabel ? `${recordLabel} · ` : ""}
        {relativeTime(occurredAt)}
      </p>
    </>
  );

  return href ? (
    <li>
      <Link href={href} className="block px-4 py-2.5 transition-colors hover:bg-[var(--cd-surface-hover)]">
        {body}
      </Link>
    </li>
  ) : (
    <li className="px-4 py-2.5">{body}</li>
  );
}

function QuickLink({ href, icon, label, sub }: { href: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link href={href}>
      <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-[var(--cd-shadow-lg)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-[var(--cd-radius-md)] bg-[var(--cd-accent-soft)] text-[var(--cd-accent)]">{icon}</span>
        <span>
          <span className="block text-[13.5px] font-bold text-[var(--cd-text)]">{label}</span>
          <span className={`block ${TEXT.micro} text-[var(--cd-text-muted)]`}>{sub}</span>
        </span>
      </Card>
    </Link>
  );
}
