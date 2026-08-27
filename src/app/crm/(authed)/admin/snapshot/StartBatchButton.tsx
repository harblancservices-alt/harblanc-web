"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { createBatch } from "./actions";

/**
 * Start a batch and go straight to it.
 *
 * One tap, no naming dialog — the batch gets a default label ("27 Aug — B")
 * and can be renamed later. Anything between "I want to start scanning" and
 * a live shutter is friction on the one action this screen exists for.
 */
export function StartBatchButton({ full }: { full?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await createBatch();
      if (res.ok) router.push(`/crm/admin/snapshot/${res.id}`);
      else setError(res.error);
    });
  }

  return (
    <div className={full ? "flex flex-col items-center gap-2" : "flex flex-col gap-2"}>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Starting…" : "Start a batch"}
      </button>
      {error && (
        <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1 text-[12px] font-semibold text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
