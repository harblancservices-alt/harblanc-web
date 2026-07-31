"use client";

import { LogCallDialog, type CallContactOption } from "../../calls/LogCallDialog";

/**
 * The profile's "Log call" action — the shared LogCallDialog opened from a
 * secondary button at the top of the company profile, with the company's
 * contacts available to attach. A thin client wrapper so the server-rendered
 * profile can drop it in (the render-prop trigger can't cross the server
 * boundary).
 */
export function LogCallButton({
  accountId,
  contacts,
}: {
  accountId: string;
  contacts: CallContactOption[];
}) {
  return (
    <LogCallDialog
      accountId={accountId}
      contacts={contacts}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-card px-3.5 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-inset"
        >
          Log call
        </button>
      )}
    />
  );
}
