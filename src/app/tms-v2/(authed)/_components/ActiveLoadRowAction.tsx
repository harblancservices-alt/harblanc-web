"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OdometerModal } from "../loads/[id]/OdometerModal";
import type { LoadWithFinancials } from "@/lib/data/loads";

/** Today's Active Loads row micro-action — quick odometer entry without
 * leaving the page, reusing the same OdometerModal Load Detail uses.
 * Closes the audit's "the list is a working surface, not just a link-
 * through" gap. Stops the click from bubbling into DataList's per-cell
 * <Link> before opening the modal, same trick MarkPaidCell uses. */
export function ActiveLoadRowAction({ load }: { load: LoadWithFinancials }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="h-7 shrink-0 rounded-md border border-line-strong bg-card px-2.5 text-[12px] font-medium text-fg hover:bg-elevated"
      >
        Odometer
      </button>
      <OdometerModal
        open={open}
        onClose={() => setOpen(false)}
        loadId={load.id}
        odoAssigned={load.odoAssigned}
        odoLoaded={load.odoLoaded}
        odoDelivered={load.odoDelivered}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
