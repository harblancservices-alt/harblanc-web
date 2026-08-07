"use client";

import { useEffect } from "react";

/** Deep-link support (audit's "dashboard's alert list lands the operator
 * directly on the section they need" principle) — on mount, scrolls the
 * page's own inner scroll container (PageScroll's overflow-y-auto div, not
 * the window) to whatever section the URL hash names. Runs after a short
 * delay so a collapsible section's own hash-triggered `setOpen(true)` (see
 * CollapsibleSection/FinancialsSection) has painted first. */
export function ScrollToHash() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, []);

  return null;
}
