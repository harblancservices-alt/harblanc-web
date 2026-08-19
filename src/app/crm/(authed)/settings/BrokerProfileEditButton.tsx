"use client";

import { BrokerProfileDialog } from "./BrokerProfileDialog";
import { BTN_EDIT } from "../_shell/ui";
import type { BrokerProfile } from "../_shell/brokerProfile";

/**
 * Client-side trigger wrapper for BrokerProfileDialog: settings/page.tsx is
 * a Server Component, and a Server Component can't pass a plain function
 * (the dialog's `trigger` render prop) across the client boundary. The
 * button has to be built here.
 */
export function BrokerProfileEditButton({ profile }: { profile: BrokerProfile }) {
  return (
    <BrokerProfileDialog
      profile={profile}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className={`shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
        >
          Edit
        </button>
      )}
    />
  );
}
