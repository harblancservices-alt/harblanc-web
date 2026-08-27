"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Pull the server's answer into the file area.
 *
 * This button exists BECAUSE capture deliberately does not refresh. A shot
 * lands in the filmstrip instantly and in this list only when asked, which
 * is what keeps four hundred shots from triggering four hundred page
 * rebuilds. The cost is that the two can disagree for a while, so there has
 * to be an obvious way to reconcile them — otherwise the honest "this is
 * what is really in storage" list just looks broken.
 */
export function RefreshFiles({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-fg-muted">
        In storage · <span className="crm-num">{count}</span>
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="rounded-md border border-line-strong bg-card px-2.5 py-1 text-[11.5px] font-bold text-fg transition-colors hover:bg-inset disabled:opacity-60"
      >
        {pending ? "Checking…" : "Refresh"}
      </button>
    </div>
  );
}
