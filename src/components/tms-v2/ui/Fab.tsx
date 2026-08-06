"use client";

import type { ButtonHTMLAttributes } from "react";
import { IconPlus } from "@/lib/nav/icons";

/**
 * Thumb-zone floating action button — the mobile counterpart to a page's
 * top-right primary action (v2-design.md's mobile note: Brent works from
 * his phone at fuel islands, so the primary action needs to sit where a
 * thumb already is, not up in the header). Fixed above the bottom nav
 * (<lg, matching BottomNav's own breakpoint), hidden once the sidebar
 * layout has room for the header action instead.
 */
export function Fab({ label, className = "", ...props }: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-e3 hover:bg-accent-hover lg:hidden ${className}`}
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      {...props}
    >
      <IconPlus className="h-6 w-6" />
    </button>
  );
}
