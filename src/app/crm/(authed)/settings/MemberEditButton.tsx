"use client";

import { MemberDialog, type MemberDefaults } from "./MemberDialog";
import { BTN_EDIT } from "../_shell/ui";

/**
 * Client-side trigger wrapper for MemberDialog — see AddDealButton.tsx for
 * why this indirection exists: settings/page.tsx is a Server Component, and
 * a Server Component can't pass a plain function (MemberDialog's `trigger`
 * render prop) across the client boundary. The button has to be built here.
 */
export function MemberEditButton({
  member,
  isSelf,
}: {
  member: MemberDefaults;
  isSelf: boolean;
}) {
  return (
    <MemberDialog
      member={member}
      isSelf={isSelf}
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
