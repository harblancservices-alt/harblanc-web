"use client";

import { useEffect, useState } from "react";

/**
 * Compact UTC clock for the dispatch top bar. Updates every 30 seconds —
 * minute resolution is enough for the "system is live" feel without
 * burning re-renders on a 1Hz timer.
 *
 * Renders an em-dash placeholder until the first client tick to keep SSR
 * markup deterministic.
 */
export function DispatchClock() {
  const [label, setLabel] = useState<string>("\u2014");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      setLabel(`${hh}:${mm} UTC`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      suppressHydrationWarning
      aria-label="Current UTC time"
      className="hidden font-mono text-xs tracking-[0.12em] text-zinc-600 uppercase md:inline"
    >
      {label}
    </span>
  );
}
