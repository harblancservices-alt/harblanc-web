import type { ReactNode } from "react";

/**
 * Admin equivalent of the CRM's `_shell/StickyActionBar.tsx` — pins
 * Save/Generate/Cancel buttons to the bottom of a content-heavy mobile form
 * sheet (`AdminModal` with `fullScreen`) so the primary action never scrolls
 * out of reach on a long form (LogServiceModal, Quote edit-shipment-details).
 *
 * Below `sm` it's a real sticky bar with a top hairline and safe-area
 * padding, bleeding out of the host's `p-4` via negative margins. At `sm`
 * and up it reverts to plain static flow — desktop dialogs already fit
 * within their existing height cap, so nothing needs pinning there.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex items-center justify-end gap-2 border-t border-line-strong bg-card px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      {children}
    </div>
  );
}
