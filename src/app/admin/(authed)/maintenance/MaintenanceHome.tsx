"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { LogServiceModal, type ServicePreset } from "./LogServiceModal";
import {
  CategoryBadge,
  CategoryIcon,
  OdometerHero,
  PreventativeIcon,
  ReminderCard,
  RepairRow,
  SectionLabel,
} from "./shared";
import { PREVENTATIVE_SLUG } from "@/lib/dispatch/repair-log";
import type {
  CategoryCard,
  PreventativeSummary,
  RepairEntry,
  ReminderView,
} from "./types";

export function MaintenanceHome({
  currentOdo,
  categoryCards,
  preventative,
  alertReminders,
  entries,
  partGroups,
}: {
  currentOdo: number;
  categoryCards: CategoryCard[];
  preventative: PreventativeSummary;
  alertReminders: ReminderView[];
  entries: RepairEntry[];
  partGroups: string[];
}) {
  const [modal, setModal] = useState<ServicePreset | null | undefined>(undefined);
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
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Truck"
          title="Maintenance"
          className="mb-3"
          actions={
            <Button type="button" onClick={() => setModal(null)} variant="primary">
              + Log a service
            </Button>
          }
        />

        <OdometerHero currentOdo={currentOdo} />

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

            {/* Category grid — parts-first (count + attention badge, no $). The
                green Preventative card leads: it's the cross-cutting stay-ahead
                lens, not a mechanical home. */}
            <section className="mt-5">
              <SectionLabel title="Categories" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <Link
                  href={`/admin/maintenance/${PREVENTATIVE_SLUG}`}
                  className="flex flex-col justify-between rounded-lg border border-green-300 bg-green-50 p-3.5 shadow-e1 transition-colors hover:border-green-400 hover:bg-green-100"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-700">
                      <PreventativeIcon />
                    </span>
                    <CategoryBadge badge={preventative.badge} />
                  </div>
                  <h3 className="mt-3 text-[13.5px] font-semibold leading-tight text-green-800">
                    Preventative
                  </h3>
                  <p className="mt-1 font-mono text-[11px] tabular-nums text-green-700">
                    {preventative.count} item{preventative.count === 1 ? "" : "s"} · stay ahead
                  </p>
                </Link>
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
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-fg-subtle">
                      {c.count} part{c.count === 1 ? "" : "s"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
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
