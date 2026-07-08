"use client";

import { Button } from "@/components/ui/Button";

/**
 * Opens Email-a-Broker as a floating pop-out WINDOW — a compact, chrome-less
 * browser window Brent can keep up beside the load boards. A fixed window name
 * means a second click focuses/reuses the same window instead of stacking new
 * ones. Runs on a real click (user gesture) so the popup isn't blocked.
 *
 * Falls back to the full-page tool in a new tab if the browser refuses the popup
 * (the nav still has the full-page /admin/dispatch/email-broker entry too).
 */

/** Chrome-less popup route (authed, no sidebar/top-nav shell). */
export const POPUP_PATH = "/admin/popup/email-broker";
/** Full-page fallback route (inside the normal admin shell). */
export const FULL_PATH = "/admin/dispatch/email-broker";
/** Fixed window name so repeat clicks reuse the one window. */
const WINDOW_NAME = "harblanc-email-broker";
const FEATURES = "popup=yes,width=460,height=860,menubar=no,toolbar=no,location=no,status=no";

export function openEmailBrokerPopup() {
  if (typeof window === "undefined") return;
  const w = window.open(POPUP_PATH, WINDOW_NAME, FEATURES);
  if (w) {
    w.focus();
  } else {
    // Popup blocked — fall back to the full-page tool in a new tab.
    window.open(FULL_PATH, "_blank");
  }
}

export function PopoutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="utility"
      onClick={openEmailBrokerPopup}
      className={className}
    >
      {children ?? "Email a Broker"}
    </Button>
  );
}
