"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusTag } from "@/components/ui/StatusTag";
import { LogRepairModal } from "../../LogRepairModal";
import {
  FRESHNESS_META,
  POSITION_LABEL,
  formatDate,
  isPosition,
  money,
} from "@/lib/dispatch/repair-log";
import type { EntryLite, SetSlot } from "../../types";

export function SetView({
  label,
  currentOdo,
  slots,
  combinedCost,
  entries,
  partGroups,
  allEntries,
}: {
  label: string;
  currentOdo: number;
  slots: SetSlot[];
  combinedCost: number;
  entries: {
    id: string;
    description: string;
    date: string | null;
    odometer: number | null;
    cost: number | null;
    position: string | null;
  }[];
  partGroups: string[];
  allEntries: EntryLite[];
}) {
  const router = useRouter();
  const [logging, setLogging] = useState(false);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button href="/admin/maintenance" variant="navigate" size="sm">
            ← Back
          </Button>
          <Button
            type="button"
            onClick={() => setLogging(true)}
            variant="primary"
            size="sm"
          >
            + Log a part
          </Button>
        </div>

        {/* Set header */}
        <div className="rounded-lg border border-line bg-card p-4 shadow-e2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
            Set
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <h1 className="text-[20px] font-bold leading-tight text-fg">
              {label}
            </h1>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
                Combined
              </p>
              <p className="font-mono text-[18px] font-bold leading-none tabular-nums text-ok">
                {combinedCost > 0 ? money(combinedCost) : "$0"}
              </p>
            </div>
          </div>
        </div>

        {/* Corners grid */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {slots.map((s) => (
            <SlotCard key={s.position} slot={s} />
          ))}
        </div>

        {/* All entries in the set */}
        <section className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink-3">
              All entries
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              · {entries.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {entries.map((e) => {
              const pos = isPosition(e.position) ? e.position : null;
              return (
                <Link
                  key={e.id}
                  href={`/admin/maintenance/${e.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-2.5 py-2 transition-colors hover:border-line-strong hover:bg-inset"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-fg">
                      {pos ? `${POSITION_LABEL[pos]} · ` : ""}
                      {e.description}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
                      {formatDate(e.date) ?? "—"}
                      {e.odometer != null
                        ? ` · ${e.odometer.toLocaleString()} mi`
                        : ""}
                    </span>
                  </div>
                  {e.cost != null ? (
                    <span className="shrink-0 font-mono text-[12.5px] font-bold tabular-nums text-ok">
                      {money(e.cost)}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {logging ? (
        <LogRepairModal
          currentOdo={currentOdo}
          partGroups={partGroups}
          allEntries={allEntries}
          preset={{ partGroup: label, position: "" }}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SlotCard({ slot }: { slot: SetSlot }) {
  const fm = FRESHNESS_META[slot.freshness];
  return (
    <div className="rounded-md border border-line bg-card p-3 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
          {slot.label}
        </span>
        <StatusTag tone={fm.tone} className="shrink-0">
          {fm.label}
        </StatusTag>
      </div>
      {slot.entry ? (
        <Link href={`/admin/maintenance/${slot.entry.id}`} className="mt-1.5 block">
          <span className="block truncate text-[12.5px] font-semibold text-fg hover:underline">
            {slot.entry.description}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-fg-subtle">
            {formatDate(slot.entry.date) ?? "—"}
            {slot.entry.odometer != null
              ? ` · ${slot.entry.odometer.toLocaleString()} mi`
              : ""}
          </span>
        </Link>
      ) : (
        <p className="mt-1.5 font-mono text-[11px] text-fg-subtle">
          Never logged
        </p>
      )}
    </div>
  );
}
