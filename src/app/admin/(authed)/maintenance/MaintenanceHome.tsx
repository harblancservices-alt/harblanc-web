"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogRepairModal, type RepairPreset } from "./LogRepairModal";
import {
  CategoryBadge,
  CategoryIcon,
  OdometerHero,
  ReminderCard,
  RepairRow,
  SectionLabel,
} from "./shared";
import { money } from "@/lib/dispatch/repair-log";
import type {
  CategoryCard,
  CostRollups,
  EntryLite,
  RepairEntry,
  ReminderView,
} from "./types";

export function MaintenanceHome({
  currentOdo,
  rollups,
  categoryCards,
  alertReminders,
  entries,
  partGroups,
  allEntries,
}: {
  currentOdo: number;
  rollups: CostRollups;
  categoryCards: CategoryCard[];
  alertReminders: ReminderView[];
  entries: RepairEntry[];
  partGroups: string[];
  allEntries: EntryLite[];
}) {
  const [modal, setModal] = useState<RepairPreset | null | undefined>(undefined);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return entries.filter((e) =>
      [e.description, e.notes ?? "", e.partGroup ?? "", e.category]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [entries, q]);

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

        <OdometerHero currentOdo={currentOdo} rollups={rollups} />

        {/* Global search — spans every category. */}
        <div className="mt-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all repairs…"
            className="h-10 w-full rounded-md border border-line-strong bg-card px-3.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {q ? (
          <section className="mt-4">
            <SectionLabel title="Search results" count={results.length} />
            {results.length === 0 ? (
              <div className="rounded-md border border-dashed border-line-strong bg-card px-4 py-8 text-center font-mono text-[12px] text-ink-3 shadow-e1">
                No repairs match “{query}”.
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((e) => (
                  <RepairRow key={e.id} entry={e} showCategory />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Overdue / due-soon reminder alerts. */}
            {alertReminders.length > 0 ? (
              <section className="mt-5">
                <SectionLabel title="Needs attention" count={alertReminders.length} />
                <div className="space-y-2">
                  {alertReminders.map((r) => (
                    <ReminderCard
                      key={r.id}
                      reminder={r}
                      showCategory
                      onServiceNow={() =>
                        setModal({
                          description: r.label,
                          partGroup: r.partGroup,
                          reminderInterval: r.interval,
                          category: r.category,
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Category grid. */}
            <section className="mt-5">
              <SectionLabel title="Categories" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {categoryCards.map((c) => (
                  <Link
                    key={c.category}
                    href={`/admin/maintenance/category/${c.slug}`}
                    className="flex flex-col justify-between rounded-lg border border-line bg-card p-3.5 shadow-e1 transition-colors hover:border-line-strong hover:bg-inset"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-inset text-ink-2">
                        <CategoryIcon category={c.category} />
                      </span>
                      <CategoryBadge badge={c.badge} />
                    </div>
                    <h3 className="mt-3 text-[13.5px] font-semibold leading-tight text-fg">
                      {c.category}
                    </h3>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-subtle">
                        {c.count} repair{c.count === 1 ? "" : "s"}
                      </span>
                      <span className="font-mono text-[12px] font-bold tabular-nums text-ok">
                        {c.spend > 0 ? money(c.spend) : "$0"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {modal !== undefined ? (
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
