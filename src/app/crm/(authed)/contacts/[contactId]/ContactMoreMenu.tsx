"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMore } from "../../_shell/icons";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { deleteContact } from "../../accounts/actions";
import type { TaskContactOption } from "../../tasks/TaskDialog";

/**
 * The contact header's "More" menu — Log a call (only when there's a
 * company: crm_calls is keyed to account_id, so a company-less contact has
 * nowhere for the call to land) and, owner-only, Delete. Same
 * outside-click/Escape + ref-stashed-open-callback pattern as
 * CompanyMoreMenu.tsx.
 */
export function ContactMoreMenu({
  contactId,
  contactName,
  accountId,
  contactOptions,
  canDelete,
}: {
  contactId: string;
  contactName: string;
  accountId: string | null;
  contactOptions: TaskContactOption[];
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
    if (!window.confirm(`Delete ${contactName}? This can't be undone from here.`)) return;
    setError(null);
    startTransition(async () => {
      // deleteContact's accountId param is only used for cache revalidation
      // and clearing a matching primary-contact pointer — "" is the same
      // no-op fallback the pre-rebuild ContactActionsRow used for a
      // company-less contact.
      const res = await deleteContact(contactId, accountId ?? "");
      if (res.ok) router.push(accountId ? `/crm/accounts/${accountId}` : "/crm/contacts");
      else setError(res.error);
    });
  }

  if (!accountId && !canDelete) return null;

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
        <div className="absolute right-0 top-full z-20 mt-1 w-44 border border-line-strong bg-card shadow-e3">
          {accountId && (
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
          )}
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="block w-full border-t border-line-strong px-4 py-3 text-left text-[13px] font-semibold text-bad hover:bg-bad-bg disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      )}

      {error && <p className="absolute right-0 top-full mt-1 w-44 text-[11.5px] text-bad">{error}</p>}

      {accountId && (
        <LogCallDialog
          accountId={accountId}
          contacts={contactOptions}
          defaultContactId={contactId}
          trigger={(openDialog) => {
            openLogCallRef.current = openDialog;
            return null;
          }}
        />
      )}
    </div>
  );
}
