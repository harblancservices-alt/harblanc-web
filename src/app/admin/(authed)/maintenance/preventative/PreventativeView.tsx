"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LogServiceModal, type ServicePreset } from "../LogServiceModal";
import {
  CategoryIcon,
  PreventativeIcon,
  ReminderCard,
  RepairRow,
} from "../shared";
import type { PreventativeGroup } from "../types";

/**
 * Preventative lens — the green "stay-ahead" view. Every preventative item
 * across every system, each with its mileage countdown, grouped and labelled by
 * its mechanical home category.
 */
export function PreventativeView({
  currentOdo,
  groups,
  totalCount,
  partGroups,
}: {
  currentOdo: number;
  groups: PreventativeGroup[];
  totalCount: number;
  partGroups: string[];
}) {
  const [modal, setModal] = useState<ServicePreset | null | undefined>(undefined);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-3">
          <Button href="/admin/maintenance" variant="navigate" size="sm">
            ← All categories
          </Button>
        </div>

        {/* Header — the stay-ahead lens, on the same neutral card chrome every
            other maintenance surface uses. Color on this page belongs to the
            reminders below it (amber due soon, red overdue), not the banner. */}
        <div className="flex items-end justify-between gap-3 rounded-lg border border-line-strong bg-card p-4 shadow-e1">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-2">
              <PreventativeIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-bold leading-tight text-fg">
                Preventative
              </h1>
              <p className="font-mono text-[11px] tabular-nums text-fg-subtle">
                {totalCount} item{totalCount === 1 ? "" : "s"} · stay ahead of it
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setModal(null)}
            variant="primary"
          >
            + Log a service
          </Button>
        </div>

        {groups.length === 0 ? (
          <div className="mt-5 rounded-md border border-dashed border-line-strong bg-card px-4 py-12 text-center font-mono text-[12px] text-ink-3 shadow-e1">
            Nothing scheduled yet. Log an oil change, filter, or fluid — or add a
            mileage reminder — and it shows up here.
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {groups.map((g) => (
              <section key={g.category}>
                {/* System label — which mechanical home these belong to. */}
                <Link
                  href={`/admin/maintenance/category/${g.slug}`}
                  className="group mb-2 inline-flex items-center gap-2"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-inset text-ink-2">
                    <CategoryIcon category={g.category} className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-ink-2 group-hover:underline">
                    {g.category}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
                    · {g.reminders.length + g.looseEntries.length}
                  </span>
                </Link>

                <div className="space-y-2">
                  {g.reminders.map((r) => (
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
                  {g.looseEntries.map((e) => (
                    <RepairRow key={e.id} entry={e} />
                  ))}
                </div>
              </section>
            ))}
          </div>
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
