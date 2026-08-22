"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignAccount } from "../../actions";
import { BTN_DANGER, BTN_NEUTRAL, BTN_PRIMARY } from "../../../_shell/ui";
import type { RepOption } from "../../CompanyDialog";

/**
 * The company profile's ownership control — the "Owner" cluster in the
 * desktop top bar, now interactive instead of a read-only chip.
 *
 * What each state shows (the UI half of the rule assignAccount() enforces
 * server-side; the server re-checks everything regardless, and the
 * crm_accounts_guard_assignment trigger backs it at the DB — nothing here is
 * load-bearing for security):
 *   - UNCLAIMED  → the "Unassigned" pill + a "Claim" button for EVERY CRM
 *                  user. Admins additionally get "Assign…", a rep picker for
 *                  seating someone else.
 *   - CLAIMED    → the owner pill (initial avatar + name). Admins
 *                  additionally get "Reassign", the same picker plus an
 *                  "Unassign" action. Non-admins get the pill and nothing
 *                  else, whether or not they're the owner — handing an
 *                  account off is an admin call.
 *
 * Its own "use client" file because ProfileTopBar is a Server Component and
 * must stay one: it passes only serializable props down here, and this file
 * imports the server action directly rather than taking a handler across the
 * boundary — the standing RSC rule this route has 500'd over before.
 *
 * The pill markup is lifted verbatim from the static chip this replaced, so
 * the bar looks unchanged until someone can actually act on it. Popover
 * open / outside-click / Escape behavior matches CompanyMoreMenu, the other
 * small popover in this same row.
 */

/** The pre-existing owner-chip classes, unchanged — see the docstring. */
const OWNER_PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-inset py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold text-fg";
const OWNER_INITIAL =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white";
const UNASSIGNED_PILL =
  "rounded-full border border-line-strong bg-inset px-2.5 py-1 text-[12px] font-semibold text-fg-muted";

const CONTROL_BTN =
  "inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors";
const MENU_ITEM =
  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] font-semibold text-fg transition-colors hover:bg-inset disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent";

export function AssignmentControl({
  accountId,
  ownerId,
  ownerLabel,
  currentUserId,
  isAdmin,
  reps,
}: {
  accountId: string;
  /** crm_accounts.assigned_user_id — null means unclaimed. */
  ownerId: string | null;
  /** The owner's display name, or null when unclaimed (or when the owner is
   * no longer an active rep and so isn't in `reps`). */
  ownerLabel: string | null;
  currentUserId: string;
  /** role === 'owner'. Only widens what's OFFERED — never what's allowed. */
  isAdmin: boolean;
  reps: RepOption[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function run(targetUserId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await assignAccount(accountId, targetUserId);
      if (res.ok) {
        setMenuOpen(false);
        // Unlike the Prospects queue's LeadCard (whose row leaves the list on
        // a successful claim), this row survives the write — so refreshing to
        // the server's already-revalidated data is the right move here.
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const claimed = ownerId !== null;
  const initial = (ownerLabel ?? "").trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative flex shrink-0 items-center gap-2">
      {claimed ? (
        <span className={OWNER_PILL}>
          <span className={OWNER_INITIAL}>{initial || "?"}</span>
          {ownerLabel ?? "Assigned"}
        </span>
      ) : (
        <span className={UNASSIGNED_PILL}>Unassigned</span>
      )}

      {!claimed && (
        <button
          type="button"
          onClick={() => run(currentUserId)}
          disabled={pending}
          className={`${CONTROL_BTN} ${BTN_PRIMARY}`}
        >
          {pending ? "Claiming…" : "Claim"}
        </button>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={pending}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={`${CONTROL_BTN} ${BTN_NEUTRAL}`}
        >
          {claimed ? "Reassign" : "Assign…"}
        </button>
      )}

      {/* One absolutely-positioned stack so an error and the open picker can
          never land on top of each other. */}
      {(menuOpen || error) && (
        <div className="absolute right-0 top-full z-30 mt-1.5 flex w-60 flex-col gap-1.5">
          {error && (
            <p className="rounded-md border border-bad/30 bg-bad-bg px-2.5 py-1.5 text-[12px] font-semibold text-bad">
              {error}
            </p>
          )}

          {menuOpen && (
            <div className="rounded-lg border border-line-strong bg-card p-1.5 shadow-e3">
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
                {claimed ? "Reassign to" : "Assign to"}
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {reps.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => run(r.id)}
                      disabled={pending || r.id === ownerId}
                      className={MENU_ITEM}
                    >
                      <span className="min-w-0 truncate">{r.label}</span>
                      {r.id === ownerId ? (
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
                          Owner
                        </span>
                      ) : r.id === currentUserId ? (
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-accent">
                          You
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>

              {claimed && (
                <button
                  type="button"
                  onClick={() => run(null)}
                  disabled={pending}
                  className={`mt-1.5 w-full rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors ${BTN_DANGER}`}
                >
                  {pending ? "Working…" : "Unassign"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
