"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDemoMode } from "@/actions/tms-v2/settings";

const BASE = "h-9 flex-1 rounded-md px-3 text-[13px] font-medium transition-colors";

/** Real, persisted demo-mode toggle — the same cookie legacy's Settings
 * toggle sets (src/lib/admin/demo.ts's DEMO_COOKIE), shared by /admin and
 * /tms-v2, so flipping it here also flips /admin's own demo state. Two-
 * button segmented control, matching legacy's toggle shape. */
export function DemoModeToggle({ initialOn }: { initialOn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(on: boolean) {
    if (pending || on === initialOn) return;
    startTransition(async () => {
      await setDemoMode(on);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex w-fit max-w-xs overflow-hidden rounded-md border border-line-strong">
      <button
        type="button"
        onClick={() => set(false)}
        disabled={pending}
        aria-pressed={!initialOn}
        className={`${BASE} ${!initialOn ? "bg-fg text-canvas" : "bg-card text-fg-muted hover:bg-elevated"}`}
      >
        Off
      </button>
      <button
        type="button"
        onClick={() => set(true)}
        disabled={pending}
        aria-pressed={initialOn}
        className={`${BASE} ${initialOn ? "bg-warn text-white" : "bg-card text-fg-muted hover:bg-elevated"}`}
      >
        {pending ? "Switching…" : "Demo"}
      </button>
    </div>
  );
}
