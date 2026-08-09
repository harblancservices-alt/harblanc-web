"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMore } from "../../_shell/icons";
import { LogCallDialog } from "../../calls/LogCallDialog";
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
 */
export function CompanyMoreMenu({
  accountId,
  accountName,
  contacts,
  canDelete,
}: {
  accountId: string;
  accountName: string;
  contacts: TaskContactOption[];
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
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
    if (!window.confirm(`Delete ${accountName}? This can't be undone from here.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAccount(accountId);
      if (res.ok) router.push("/crm/accounts");
      else setError(res.error);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center border border-fg-subtle bg-card text-fg-muted transition-colors hover:bg-inset hover:text-fg"
      >
        <IconMore width={18} height={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 border border-line-strong bg-card shadow-e3">
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
              onClick={remove}
              disabled={pending}
              className="block w-full border-t border-line-strong px-4 py-3 text-left text-[13px] font-semibold text-bad hover:bg-bad-bg disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete company"}
            </button>
          )}
        </div>
      )}

      {error && <p className="absolute right-0 top-full mt-1 w-48 text-[11.5px] text-bad">{error}</p>}

      <LogCallDialog
        accountId={accountId}
        contacts={contacts}
        trigger={(openDialog) => {
          openLogCallRef.current = openDialog;
          return null;
        }}
      />
    </div>
  );
}
