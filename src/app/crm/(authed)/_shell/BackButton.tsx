"use client";

import { useRouter } from "next/navigation";
import { IconArrowLeft } from "./icons";
import { BTN_EDIT } from "./ui";

/**
 * The CRM's ONE back control, reused everywhere a detail/sub page needs to
 * return to where the user came from — a real button (labeled, proper tap
 * target), not a bare arrow glyph, so it's unmistakably interactive and
 * identical on every page that uses it.
 *
 * Behavior: prefers real browser history (`router.back()`) so it returns to
 * the ACTUAL previous page rather than always landing on some fixed parent.
 * `window.history.length > 1` is the signal that there's a real entry to
 * return to — it's incremented by every client-side navigation (Link/
 * router.push) since the tab was opened. A page that was landed on directly
 * (bookmark, refresh, new tab, or a shared link) has no meaningful "back" in
 * this session, and `router.back()` there would exit the CRM entirely — so
 * it falls back to `fallbackHref`, a sensible parent (e.g. the company
 * profile falls back to the Companies list), never all the way to the
 * dashboard/root unless that parent genuinely IS the dashboard.
 */
export function BackButton({
  fallbackHref,
  label = "Back",
  className,
}: {
  /** Sensible parent route to use when there's no real history to return to. */
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  function onClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        `inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`
      }
    >
      <IconArrowLeft width={15} height={15} />
      {label}
    </button>
  );
}
