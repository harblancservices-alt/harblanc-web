"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Money } from "@/components/tms-v2/ui/Money";
import { DateTimeCST } from "@/components/tms-v2/ui/DateTimeCST";
import { fetchServiceFull } from "@/actions/tms-v2/maintenance";
import { LogServiceModal, type ServiceFull, type ServiceTypePreset } from "../../LogServiceModal";
import type { ServiceTypeHistoryItem } from "@/lib/data/maintenance";

/** The service-type profile's "+ Log this service" — the type is
 * pre-filled (LogServiceModal's `preset`), not chosen: no category/
 * sub-category picker, just date/odometer/receipts/notes and an optional
 * interval update. */
export function ServiceTypeLogButton({
  currentOdo,
  partGroups,
  preset,
}: {
  currentOdo: number;
  partGroups: string[];
  preset: ServiceTypePreset;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="info" onClick={() => setOpen(true)}>
        + Log this service
      </Button>
      <LogServiceModal
        open={open}
        currentOdo={currentOdo}
        partGroups={partGroups}
        preset={preset}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

/** One History row — tapping it fetches the whole service (all its parts,
 * receipts, notes; not just the one part matching this type) and opens the
 * same edit flow EntryActions.tsx uses on the old per-part detail page,
 * just anchored to the SERVICE instead of one of its parts. */
export function HistoryRow({
  item,
  currentOdo,
  partGroups,
}: {
  item: ServiceTypeHistoryItem;
  currentOdo: number;
  partGroups: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [full, setFull] = useState<ServiceFull | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openEdit() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const data = await fetchServiceFull(item.serviceId);
    setLoading(false);
    if (!data) {
      setError("Could not load this service.");
      return;
    }
    setFull(data);
    setEditing(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void openEdit()}
        disabled={loading}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-elevated disabled:opacity-60"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-fg">
            <DateTimeCST value={item.date} mode="date" />
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">
            {item.odometer != null ? `${item.odometer.toLocaleString()} mi` : "—"}
            {item.shop ? ` · ${item.shop}` : ""}
            {item.receiptCount > 0 ? ` · ${item.receiptCount} receipt${item.receiptCount === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <Money value={item.cost} tone="none" className="shrink-0 text-[14px] font-semibold" />
      </button>
      {error ? <p className="px-4 pb-2 text-[11.5px] font-medium text-bad">{error}</p> : null}

      {full ? (
        <LogServiceModal
          open={editing}
          currentOdo={currentOdo}
          partGroups={partGroups}
          editService={full}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
          onDeleted={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
