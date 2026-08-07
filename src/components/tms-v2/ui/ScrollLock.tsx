"use client";

import { useEffect } from "react";

/** Renders nothing — mounting it locks document.body scroll (restored on
 * unmount). For an overlay that's a Server Component with no open/close
 * JS state of its own to hang a lock effect on (its own mount/unmount IS
 * the open state — e.g. ContextDrawer, driven purely by whether the
 * page's `?id=` searchParam is present). Same scroll-bleed reasoning as
 * Modal's own body-lock effect: stops a background scroll container from
 * moving while an overlay sits on top of it. */
export function ScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return null;
}
