"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { LogServiceModal } from "./LogServiceModal";

/** Header button (desktop) + Fab (mobile) opening the Log Service form —
 * closes the audit's Critical Maintenance gap: previously nothing could be
 * recorded from tms-v2 at all, not even a partial record. */
export function LogServiceButton({ currentOdo, partGroups }: { currentOdo: number; partGroups: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function onSaved() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="hidden sm:inline-flex">
        + Log service
      </Button>
      <Fab label="Log service" onClick={() => setOpen(true)} className="sm:hidden" />
      <LogServiceModal open={open} currentOdo={currentOdo} partGroups={partGroups} onClose={() => setOpen(false)} onSaved={onSaved} />
    </>
  );
}
