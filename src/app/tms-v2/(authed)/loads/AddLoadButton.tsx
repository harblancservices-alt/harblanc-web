"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { LoadFormModal } from "./LoadFormModal";

/** Loads page header trigger for LoadFormModal in Add mode. */
export function AddLoadButton({ brokerNames, activeTripNames }: { brokerNames: string[]; activeTripNames: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add load
      </Button>
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
