"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDemoMode } from "./actions";

/**
 * DEMO MODE toggle. Flips the server-readable `hb-demo` cookie via a server
 * action, then refreshes so every page re-reads under the new mode. When ON,
 * the whole admin portal shows the curated fake dataset and every mutating
 * action no-ops — the real database is never read or written.
 */
export function DemoModeToggle({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function apply(next: boolean) {
    if (next === on || pending) return;
    setOn(next);
    startTransition(async () => {
      await setDemoMode(next);
      // Re-fetch every server component so reads + the banner reflect the flip.
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <div className="inline-flex rounded-md border border-line-strong bg-inset p-0.5">
        {(
          [
            { key: false, label: "Off" },
            { key: true, label: "Demo" },
          ] as const
        ).map((opt) => (
          <button
            key={String(opt.key)}
            type="button"
            onClick={() => apply(opt.key)}
            disabled={pending}
            aria-pressed={on === opt.key}
            className={
              "rounded px-6 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-60 " +
              (on === opt.key
                ? opt.key
                  ? "bg-amber-400 text-black shadow-e1"
                  : "bg-graphite text-white shadow-e1"
                : "text-ink-2 hover:text-ink")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-2">
        {on
          ? "Demo mode is ON — the portal is showing curated sample data. No real records are read or changed."
          : "Turn on to present the portal with realistic sample data. The real database stays untouched."}
      </p>
    </div>
  );
}
