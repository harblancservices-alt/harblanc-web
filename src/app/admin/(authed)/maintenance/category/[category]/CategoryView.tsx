"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LogServiceModal, type ServicePreset } from "../../LogServiceModal";
import {
  CategoryIcon,
  FreshnessBadge,
  ReminderCard,
  RepairRow,
  SectionLabel,
} from "../../shared";
import { formatDate, type Category } from "@/lib/dispatch/repair-log";
import type { CategorySet, RepairEntry, ReminderView, SetSlot } from "../../types";

export function CategoryView({
  category,
  entries,
  sets,
  reminders,
  currentOdo,
  partGroups,
}: {
  category: Category;
  entries: RepairEntry[];
  sets: CategorySet[];
  reminders: ReminderView[];
  currentOdo: number;
  partGroups: string[];
}) {
  const [modal, setModal] = useState<ServicePreset | null | undefined>(undefined);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return entries;
    return entries.filter((e) =>
      [e.description, e.notes ?? "", e.partGroup ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [entries, q]);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-3">
          <Button href="/admin/maintenance" variant="navigate" size="sm">
            ← All categories
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-end justify-between gap-3 border-b-2 border-line-strong pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-2">
              <CategoryIcon category={category} className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold leading-tight text-ink">
                {category}
              </h1>
              <p className="font-mono text-[11px] tabular-nums text-fg-subtle">
                {entries.length} part{entries.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setModal({ initialPart: { category } })}
            variant="primary"
          >
            + Log a service
          </Button>
        </div>

        {/* Scheduled — this category's preventative items with mileage
            countdown, pinned at the top. Neutral section chrome: the reminder
            cards inside carry the real signal (amber due soon, red overdue),
            and a green box around them would compete with it. */}
        {reminders.length > 0 ? (
          <section className="mt-4 rounded-lg border border-line-strong bg-card p-3 shadow-e1">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
                Scheduled
              </span>
              <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                · {reminders.length}
              </span>
            </div>
            <div className="space-y-2">
              {reminders.map((r) => (
                <ReminderCard
                  key={r.id}
                  reminder={r}
                  onServiceNow={() =>
                    setModal({
                      initialPart: {
                        description: r.label,
                        partGroup: r.partGroup,
                        reminderInterval: r.interval,
                        category: r.category,
                      },
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Sets — positioned part groups, corners inline. */}
        {sets.length > 0 ? (
          <section className="mt-4">
            <SectionLabel title="Sets" count={sets.length} />
            <div className="space-y-2">
              {sets.map((s) => (
                <SetStrip key={s.partGroup} set={s} />
              ))}
            </div>
          </section>
        ) : null}

        {/* All parts */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <SectionLabel title="All repairs" count={entries.length} inline />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${category}…`}
              className="h-8 w-40 rounded-md border border-line-strong bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40 sm:w-56"
            />
          </div>
          {entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-10 text-center font-mono text-[12px] text-ink-3 shadow-e1">
              No parts in this category yet.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
              No parts match “{query}”.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <RepairRow key={e.id} entry={e} />
              ))}
            </div>
          )}
        </section>
      </div>

      {modal !== undefined ? (
        <LogServiceModal
          currentOdo={currentOdo}
          partGroups={partGroups}
          preset={modal}
          onClose={() => setModal(undefined)}
        />
      ) : null}
    </div>
  );
}

function SetStrip({ set }: { set: CategorySet }) {
  return (
    <Link
      href={`/admin/maintenance/set/${encodeURIComponent(set.partGroup)}`}
      className="block rounded-lg border border-line-strong bg-card p-3 shadow-e2 transition-shadow hover:shadow-e3 active:bg-inset"
    >
      <h3 className="truncate text-[13.5px] font-semibold text-fg">
        {set.partGroup}
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {set.slots.map((s) => (
          <SetCorner key={s.position} slot={s} />
        ))}
      </div>
    </Link>
  );
}

function SetCorner({ slot }: { slot: SetSlot }) {
  return (
    <div className="rounded-md border border-line bg-inset px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
          {slot.label}
        </span>
        <FreshnessBadge freshness={slot.freshness} />
      </div>
      <p className="mt-0.5 font-mono text-[10px] tabular-nums text-fg-muted">
        {slot.entry?.odometer != null
          ? `${slot.entry.odometer.toLocaleString()} mi`
          : slot.entry?.date
            ? (formatDate(slot.entry.date) ?? "—")
            : "never"}
      </p>
    </div>
  );
}
