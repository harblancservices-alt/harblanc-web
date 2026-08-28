"use client";

import { useEffect } from "react";
import { IconX } from "./icons";

/**
 * The CRM's one modal shell — a bottom-sheet on mobile, a centred dialog on
 * desktop, matching the premium .crm-light chrome (a softly rounded card on
 * the e3 shadow over a dimmed scrim). Every CRM dialog (company create/edit,
 * contact add/edit, tag create) renders through this so the overlay
 * behaviour, escape-to-close, and scroll-lock stay identical everywhere.
 *
 * 2026-08-20: header rebuilt to match /crm-design's Modal exactly — a
 * separate border-b header band (title, no longer sharing the same
 * scrolling region as the body) with a circular icon-only close button,
 * not the previous bordered rectangular "Cancel" text button sharing space
 * with the title. The body is now its own independently-scrolling region
 * below the header, matching the prototype's header/body split.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  busy,
  wide,
  fullScreen,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** When true, backdrop/escape/cancel won't dismiss (a save is in flight). */
  busy?: boolean;
  /** Wider shell (max-w-6xl instead of max-w-lg) for content-heavy dialogs
   * like the RC/BOL document editors — everything else about the shell
   * (scrim, bottom-sheet-on-mobile, escape/scroll-lock) stays identical. */
  wide?: boolean;
  /** Mobile-only: below `sm` the sheet goes edge-to-edge (full viewport
   * height, no rounding) instead of the capped 92vh bottom sheet — for
   * content-heavy forms (BOL line items, shipment workspace sections) that
   * need real room on a phone. Desktop (`sm:` and up) is completely
   * unaffected — same capped, rounded, centered dialog as always. */
  fullScreen?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      /* THE SCRIM SWALLOWS ITS EVENTS. This modal is NOT portalled — it
         renders in the DOM wherever its trigger lives, which for several
         dialogs is inside a click-to-navigate row. CompanyTable wraps every
         row in ClickableRow (href=/crm/accounts/<id>) and puts
         CompanyRowActions — and therefore the contact dialog — inside it,
         so the whole dialog was mounting inside a <tr> whose onClick calls
         router.push.

         The panel already stopped its own clicks (below), but the SCRIM did
         not: a click on the dim area closed the dialog and then carried on
         up to the row, which navigated. From the rep's side the dialog
         "didn't just close out", it went somewhere. Same for Enter on a
         non-interactive element, via that row's onKeyDown.

         Stopping both here fixes it for every dialog at once rather than
         per call site. Portalling would also fix it, but this modal's
         colours come from the .crm-light scope it is rendered inside, and
         moving it to document.body would strip every token off it. */
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div
        className={`flex w-full flex-col overflow-hidden border border-line bg-card shadow-e3 sm:max-h-[92vh] sm:rounded-lg ${fullScreen ? "h-[100dvh] max-h-[100dvh] rounded-none" : "max-h-[92vh] rounded-t-lg"} ${wide ? "max-w-6xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <h2 className="truncate text-[15px] font-bold tracking-tight text-fg">{title}</h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-inset hover:text-fg"
          >
            <IconX width={16} height={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
