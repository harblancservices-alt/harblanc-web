"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTag, type StatusTone } from "@/components/ui/StatusTag";
import { IntervalBar } from "./IntervalBar";
import { LogRepairModal, type RepairPreset } from "./LogRepairModal";
import {
  POSITION_LABEL,
  formatDate,
  isPosition,
  money,
  type MaintStatus,
} from "@/lib/dispatch/repair-log";
import type {
  CostRollups,
  EntryLite,
  RepairEntry,
  ReminderView,
  SetSummary,
} from "./types";

const STATUS_TONE: Record<MaintStatus, StatusTone> = {
  overdue: "red",
  soon: "amber",
  ok: "green",
  baseline: "steel",
};
const STATUS_LABEL: Record<MaintStatus, string> = {
  overdue: "Overdue",
  soon: "Due soon",
  ok: "OK",
  baseline: "No baseline",
};

function reminderRemaining(r: ReminderView): { text: string; color: string } {
  if (r.milesRemaining == null) {
    return { text: "set baseline", color: "text-steel" };
  }
  const m = r.milesRemaining;
  if (m <= 0) {
    return {
      text: `${Math.abs(m).toLocaleString()} mi over`,
      color: "text-bad",
    };
  }
  return {
    text: `${m.toLocaleString()} mi left`,
    color: r.status === "soon" ? "text-warn" : "text-ok",
  };
}

export function RepairLogView({
  currentOdo,
  entries,
  reminders,
  rollups,
  sets,
  partGroups,
  allEntries,
}: {
  currentOdo: number;
  entries: RepairEntry[];
  reminders: ReminderView[];
  rollups: CostRollups;
  sets: SetSummary[];
  partGroups: string[];
  allEntries: EntryLite[];
}) {
  const [modal, setModal] = useState<RepairPreset | null | undefined>(undefined);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.description, e.notes ?? "", e.partGroup ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [entries, query]);

  const open = modal !== undefined;

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Truck"
          title="Maintenance"
          className="mb-3"
          actions={
            <Button type="button" onClick={() => setModal(null)} variant="primary">
              + Log repair
            </Button>
          }
        />

        {/* Graphite odometer hero + cost KPI tiles. */}
        <div className="relative overflow-hidden rounded-lg bg-graphite p-5 pl-6 shadow-e2">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg bg-accent"
          />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-on-dark-dim">
            Current odometer
          </p>
          <p className="mt-1.5 font-mono text-[34px] font-bold leading-none tabular-nums text-white sm:text-[40px]">
            {currentOdo.toLocaleString()}
            <span className="ml-1.5 text-[16px] font-semibold text-on-dark-dim">
              mi
            </span>
          </p>
          <p className="mt-2 text-[11.5px] text-on-dark-dim">
            Highest reading across all loads · 2018 Ram 2500 · 6.7L Cummins
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <KpiTile label="This month" value={rollups.month} />
            <KpiTile label="This year" value={rollups.ytd} />
            <KpiTile label="Lifetime" value={rollups.lifetime} />
          </div>
        </div>

        {/* Reminders strip. */}
        {reminders.length > 0 ? (
          <section className="mt-5">
            <SectionLabel title="Reminders" count={reminders.length} />
            <div className="space-y-2">
              {reminders.map((r) => {
                const rem = reminderRemaining(r);
                const overdue = r.status === "overdue";
                return (
                  <div
                    key={r.id}
                    className={
                      "rounded-md border bg-card p-3 shadow-e1 " +
                      (overdue
                        ? "border-line border-l-[3px] border-l-bad shadow-e2"
                        : "border-line")
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <StatusTag tone={STATUS_TONE[r.status]} className="shrink-0">
                          {STATUS_LABEL[r.status]}
                        </StatusTag>
                        <h3 className="truncate text-[14px] font-semibold text-fg">
                          {r.label}
                        </h3>
                      </div>
                      <span
                        className={
                          "shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums " +
                          rem.color
                        }
                      >
                        {rem.text}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10.5px] tabular-nums text-fg-subtle">
                      Every {r.interval.toLocaleString()} mi
                      {r.lastOdo != null
                        ? ` · last ${r.lastOdo.toLocaleString()} mi`
                        : " · no baseline yet"}
                      {r.nextDue != null
                        ? ` · due ${r.nextDue.toLocaleString()} mi`
                        : ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <IntervalBar
                        pct={r.pct}
                        status={r.status}
                        className="h-1.5 flex-1"
                      />
                      <Button
                        type="button"
                        onClick={() =>
                          setModal({
                            description: r.label,
                            partGroup: r.partGroup,
                            reminderInterval: r.interval,
                          })
                        }
                        variant="navigate"
                        size="sm"
                        className="shrink-0"
                      >
                        Service now
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Sets strip. */}
        {sets.length > 0 ? (
          <section className="mt-5">
            <SectionLabel title="Sets" count={sets.length} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {sets.map((s) => (
                <Link
                  key={s.partGroup}
                  href={`/admin/maintenance/set/${encodeURIComponent(s.partGroup)}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-line bg-card p-3 shadow-e1 transition-colors hover:border-line-strong hover:bg-inset"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-[13.5px] font-semibold text-fg">
                      {s.partGroup}
                    </h3>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
                      {s.positions} position{s.positions === 1 ? "" : "s"} logged
                    </p>
                  </div>
                  {s.combinedCost > 0 ? (
                    <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-ok">
                      {money(s.combinedCost)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Repair log — searchable. */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <SectionLabel title="Repair log" count={entries.length} inline />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repairs…"
              className="h-8 w-40 rounded-md border border-line-strong bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40 sm:w-56"
            />
          </div>

          {entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
              No repairs logged yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
              No repairs match “{query}”.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <LogRow key={e.id} entry={e} />
              ))}
            </div>
          )}
        </section>
      </div>

      {open ? (
        <LogRepairModal
          currentOdo={currentOdo}
          partGroups={partGroups}
          allEntries={allEntries}
          preset={modal}
          onClose={() => setModal(undefined)}
        />
      ) : null}
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-graphite-line bg-graphite-2 px-3 py-2.5">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-on-dark-dim">
        {label}
      </p>
      <p className="mt-1 font-mono text-[17px] font-bold leading-none tabular-nums text-white">
        {value > 0 ? money(value) : "$0"}
      </p>
    </div>
  );
}

function SectionLabel({
  title,
  count,
  inline = false,
}: {
  title: string;
  count: number;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "flex items-center gap-2" : "mb-2 flex items-center gap-2"}>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
        {title}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
        · {count}
      </span>
    </div>
  );
}

function LogRow({ entry }: { entry: RepairEntry }) {
  const pos = isPosition(entry.position) ? entry.position : null;
  return (
    <Link
      href={`/admin/maintenance/${entry.id}`}
      className="block rounded-md border border-line bg-card p-3 shadow-e1 transition-colors hover:border-line-strong hover:bg-inset"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-fg">
              {entry.description}
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-warn">
            {formatDate(entry.date) ?? "—"}
            {entry.odometer != null
              ? ` · ${entry.odometer.toLocaleString()} mi`
              : ""}
          </p>
          {/* Indicators */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {entry.hasReminder ? (
              <Indicator className="bg-steel-bg text-steel">↻ Recurring</Indicator>
            ) : null}
            {pos ? (
              <Indicator className="bg-slate-bg text-slate">
                {POSITION_LABEL[pos]}
              </Indicator>
            ) : entry.partGroup ? (
              <Indicator className="bg-slate-bg text-slate">
                {entry.partGroup}
              </Indicator>
            ) : null}
            {entry.receiptCount > 0 ? (
              <Indicator className="bg-elevated text-fg-muted">
                📎 {entry.receiptCount}
              </Indicator>
            ) : null}
            {entry.relatedCount > 0 ? (
              <Indicator className="bg-elevated text-fg-muted">
                ⛓ {entry.relatedCount}
              </Indicator>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {entry.cost != null ? (
            <div className="text-[17px] font-bold leading-none tabular-nums text-ok">
              {money(entry.cost)}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-fg-subtle">no cost</div>
          )}
        </div>
      </div>
    </Link>
  );
}

function Indicator({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[10px] font-semibold " +
        className
      }
    >
      {children}
    </span>
  );
}
