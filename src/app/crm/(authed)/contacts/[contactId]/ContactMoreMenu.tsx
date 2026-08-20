"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconMore } from "../../_shell/icons";
import { LogCallDialog } from "../../calls/LogCallDialog";
import { Modal } from "../../_shell/Modal";
import { BTN_DANGER } from "../../_shell/ui";
import { deleteContact } from "../../accounts/actions";
import type { TaskContactOption } from "../../tasks/TaskDialog";

/**
 * The contact header's "More" menu — Log a call (only when there's a
 * company: crm_calls is keyed to account_id, so a company-less contact has
 * nowhere for the call to land) and, owner-only, Delete. Same
 * outside-click/Escape + ref-stashed-open-callback pattern, and same shared
 * Modal delete-confirm pattern (2026-08-19), as CompanyMoreMenu.tsx.
 */
export function ContactMoreMenu({
  contactId,
  contactName,
  accountId,
  canDelete,
}: {
  contactId: string;
  contactName: string;
  accountId: string | null;
  // Accepted for caller compatibility (the contact profile page, out of this
  // task's scope) but no longer used — LogCallDialog now self-fetches
  // everything it needs to cross-autofill.
  contactOptions?: TaskContactOption[];
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
      // deleteContact's accountId param is only used for cache revalidation
      // and clearing a matching primary-contact pointer — "" is the same
      // no-op fallback the pre-rebuild ContactActionsRow used for a
      // company-less contact.
      const res = await deleteContact(contactId, accountId ?? "");
      if (res.ok) router.push(accountId ? `/crm/accounts/${accountId}` : "/crm/contacts");
      else {
        setConfirmOpen(false);
        setError(res.error);
      }
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
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg-subtle bg-card text-fg-muted transition-colors hover:bg-inset hover:text-fg"
      >
        <IconMore width={18} height={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3">
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
              onClick={() => {
                setOpen(false);
                setError(null);
                setConfirmOpen(true);
              }}
              className="block w-full border-t border-line-strong px-4 py-3 text-left text-[13px] font-semibold text-bad hover:bg-bad-bg disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {error && <p className="absolute right-0 top-full mt-1 w-44 text-[11.5px] text-bad">{error}</p>}

      {accountId && (
        <LogCallDialog
          accountId={accountId}
          contactId={contactId}
          trigger={(openDialog) => {
            openLogCallRef.current = openDialog;
            return null;
          }}
        />
      )}

      {confirmOpen && (
        <Modal open onClose={() => !pending && setConfirmOpen(false)} busy={pending} title="Delete contact">
          <p className="text-[13.5px] leading-relaxed text-fg">
            Delete <span className="font-semibold">{contactName}</span>? This can&rsquo;t be undone from
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
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
