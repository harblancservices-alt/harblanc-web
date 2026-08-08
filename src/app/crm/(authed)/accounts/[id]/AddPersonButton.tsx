"use client";

import { ContactDialog } from "./ContactDialog";
import { BTN_EDIT } from "../../_shell/ui";
import { IconPlus } from "../../_shell/icons";

/**
 * The profile top strip's "Add person" action — the shared ContactDialog
 * opened from a secondary button next to Log call. A thin client wrapper so
 * the server-rendered profile page can drop it in (the render-prop trigger
 * can't cross the server boundary — same reasoning as LogCallButton.tsx).
 */
export function AddPersonButton({ accountId }: { accountId: string }) {
  return (
    <ContactDialog
      accountId={accountId}
      mode="create"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${BTN_EDIT}`}
        >
          <IconPlus width={14} height={14} />
          Add person
        </button>
      )}
    />
  );
}
