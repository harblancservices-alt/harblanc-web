"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LogServiceModal } from "../../LogServiceModal";
import { FreshnessBadge } from "../../shared";
import {
  POSITION_LABEL,
  formatDate,
  isPosition,
  type Category,
} from "@/lib/dispatch/repair-log";
import type { SetSlot } from "@/lib/dispatch/maintenance-view-types";

export function SetView({
  label,
  category,
  currentOdo,
  slots,
  entries,
  partGroups,
}: {
  label: string;
  category: Category;
  currentOdo: number;
  slots: SetSlot[];
  entries: {
    id: string;
    description: string;
    date: string | null;
    odometer: number | null;
    position: string | null;
  }[];
  partGroups: string[];
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
          <h1 className="mt-1 text-[20px] font-bold leading-tight text-fg">
            {label}
          </h1>
        </div>

        {/* Corners grid */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {slots.map((s) => (
            <SlotCard key={s.position} slot={s} />
          ))}
        </div>

        {/* All parts in the set */}
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
                  <span className="min-w-0 truncate text-[12.5px] font-medium text-fg">
                    {pos ? `${POSITION_LABEL[pos]} · ` : ""}
                    {e.description}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg-subtle">
                    {formatDate(e.date) ?? "—"}
                    {e.odometer != null ? ` · ${e.odometer.toLocaleString()} mi` : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {logging ? (
        <LogServiceModal
          currentOdo={currentOdo}
          partGroups={partGroups}
          preset={{ initialPart: { partGroup: label, category } }}
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
  return (
    <div className="rounded-md border border-line bg-card p-3 shadow-e1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle">
          {slot.label}
        </span>
        <FreshnessBadge freshness={slot.freshness} />
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
        <p className="mt-1.5 font-mono text-[11px] text-fg-subtle">Never logged</p>
      )}
    </div>
  );
}
