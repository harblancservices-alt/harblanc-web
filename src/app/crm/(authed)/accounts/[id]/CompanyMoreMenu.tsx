"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMore } from "../../_shell/icons";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { Modal } from "../../_shell/Modal";
import { BTN_DANGER } from "../../_shell/ui";
import { deleteAccount } from "../actions";
import type { TaskContactOption } from "../../tasks/TaskDialog";

/**
 * Top bar's "More" menu — a small popover next to Edit. Only two entries:
 * "Log a call" (no default contact — the per-contact one lives on the
 * Contacts tab's master-detail panel) and, owner-only, "Delete company".
 * Closes on outside click / Escape, matching the CRM's other small popovers.
 * "Log a call" stashes LogCallDialog's `open` callback in a ref (set during
 * its own render, called from this menu's real onClick) rather than driving
 * it through extra state — calling `open()` during render would fire a side
 * effect mid-render and reopen on every rerender.
 *
 * "Delete company" confirms through the shared Modal (2026-08-19) instead of
 * a native window.confirm() — CRM_INTERACTION_HIERARCHY.md §2/§7 cited this
 * exact spot as the one native browser dialog in an otherwise all-Modal
 * destructive-confirm language (Suspend & reassign, etc.). Same
 * two-step shape as SuspendReassignDialog: the menu action only opens the
 * confirm dialog; the actual deleteAccount() call fires from the Modal's own
 * danger-toned footer button, never from the menu item itself.
 */
export function CompanyMoreMenu({
  accountId,
  accountName,
  canDelete,
}: {
  accountId: string;
  accountName: string;
  // Accepted for caller compatibility (page.tsx, out of this task's scope,
  // still passes the company's contact roster) but no longer used —
  // LogCallDialog now self-fetches everything it needs to cross-autofill.
  contacts?: TaskContactOption[];
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const openLogCallRef = useRef<(() => void) | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccount(accountId);
      if (res.ok) router.push("/crm/accounts");
      else {
        setConfirmOpen(false);
        setError(res.error);
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg-subtle bg-card text-fg-muted transition-colors hover:bg-inset hover:text-fg"
      >
        <IconMore width={18} height={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openLogCallRef.current?.();
            }}
            className="block w-full px-4 py-3 text-left text-[13px] font-semibold text-fg hover:bg-inset"
          >
            Log a call
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setConfirmOpen(true);
              }}
              className="block w-full border-t border-line-strong px-4 py-3 text-left text-[13px] font-semibold text-bad hover:bg-bad-bg disabled:opacity-60"
            >
              Delete company
            </button>
          )}
        </div>
      )}

      {error && <p className="absolute right-0 top-full mt-1 w-48 text-[11.5px] text-bad">{error}</p>}

      <LogCallDialog
        accountId={accountId}
        trigger={(openDialog) => {
          openLogCallRef.current = openDialog;
          return null;
        }}
      />

      {confirmOpen && (
        <Modal
          open
          onClose={() => !pending && setConfirmOpen(false)}
          busy={pending}
          title="Delete company"
        >
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{accountName}</span>? This can&rsquo;t be undone from
            here.
          </p>
          {error && <p className="mt-2 text-[12.5px] text-bad">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
              className="rounded-md border border-fg-subtle bg-card px-3.5 py-2 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-inset disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={`rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${BTN_DANGER}`}
            >
              {pending ? "Deleting…" : "Delete company"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
