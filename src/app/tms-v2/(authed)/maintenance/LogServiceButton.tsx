"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { LogServiceModal } from "./LogServiceModal";

/** Maintenance home's one "+ Log a service" action (Brent's per-service
 * redesign, 2026-08-08) — a single red button pinned at the bottom of the
 * page content, not a header button + a separate mobile Fab (the previous
 * shape). Opens the global logger: category/sub-category picker shown, the
 * user picks the type here (a service-type profile's own "+ Log this
 * service" — ServiceTypeActions.tsx — skips this picker instead). */
export function LogServiceButton({ currentOdo, partGroups }: { currentOdo: number; partGroups: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function onSaved() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)} className="w-full">
        + Log a service
      </Button>
      <LogServiceModal open={open} currentOdo={currentOdo} partGroups={partGroups} onClose={() => setOpen(false)} onSaved={onSaved} />
    </>
  );
}
