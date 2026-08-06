"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { Fab } from "@/components/tms-v2/ui/Fab";
import { LoadFormModal } from "./LoadFormModal";

/** Loads page header trigger for LoadFormModal in Add mode — a header
 * Button on desktop, a thumb-zone Fab on mobile, same modal either way. */
export function AddLoadButton({ brokerNames, activeTripNames }: { brokerNames: string[]; activeTripNames: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="hidden lg:block">
        <Button type="button" onClick={() => setOpen(true)}>
          Add load
        </Button>
      </div>
      <Fab label="Add load" onClick={() => setOpen(true)} />
      <LoadFormModal
        open={open}
        onClose={() => setOpen(false)}
        brokerNames={brokerNames}
        activeTripNames={activeTripNames}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
