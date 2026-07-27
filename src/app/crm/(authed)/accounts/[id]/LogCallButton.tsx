"use client";

import { LogCallDialog, type CallContactOption } from "../../calls/LogCallDialog";

/**
 * The profile's "Log call" action — the shared LogCallDialog opened from a
 * secondary button in the company header, with the company's contacts available
 * to attach. A thin client wrapper so the server-rendered profile can drop it
 * into the masthead (the render-prop trigger can't cross the server boundary).
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
        >
          Log call
        </button>
      )}
    />
  );
}
