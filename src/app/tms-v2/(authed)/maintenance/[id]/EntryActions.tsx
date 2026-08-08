"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { deletePart } from "@/actions/tms-v2/maintenance";
import { LogServiceModal, type ServiceFull } from "../LogServiceModal";
import type { RepairEntryDetail } from "@/lib/data/maintenance";

/** Entry Detail's write actions — Edit this service (all its parts +
 * receipts, via LogServiceModal in edit mode) and Delete this part. Closes
 * the audit's "editing parts... land in a later phase" gap. */
export function EntryActions({ entry }: { entry: RepairEntryDetail }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const serviceFull: ServiceFull = {
    id: entry.service.id,
    date: entry.service.date,
    odometer: entry.service.odometer,
    totalCost: entry.service.totalCost,
    notes: entry.service.notes,
    receipts: entry.service.receipts,
    parts: [
      {
        id: entry.id,
        description: entry.description,
        category: entry.category,
        subCategory: entry.subCategory,
        partGroup: entry.partGroup,
        reminderInterval: entry.reminderIntervalMiles,
      },
      ...entry.otherParts.map((p) => ({
        id: p.id,
        description: p.description,
        category: p.category,
        subCategory: p.subCategory,
        partGroup: p.partGroup,
        reminderInterval: null,
      })),
    ],
  };

  async function onDeletePart() {
    if (!confirm(`Delete "${entry.description}"? If it's the last part on this visit, the whole visit is removed too.`)) return;
    setDeleting(true);
    const result = await deletePart(entry.id);
    if (result.ok) {
      router.push("/tms-v2/maintenance");
      router.refresh();
    } else {
      setDeleting(false);
      alert(result.reason);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
        Edit service
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={onDeletePart} disabled={deleting} aria-busy={deleting}>
        {deleting ? "Deleting…" : "Delete this part"}
      </Button>

      <LogServiceModal
        open={editing}
        currentOdo={entry.currentOdo}
        partGroups={[]}
        editService={serviceFull}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
        onDeleted={() => {
          setEditing(false);
          router.push("/tms-v2/maintenance");
          router.refresh();
        }}
      />
    </div>
  );
}
