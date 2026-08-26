"use client";

import { useState } from "react";
import { ActivityLogSection, type CrmActivityLogItem } from "../ActivityLogSection";

/** How many entries show before you ask for the rest. Enough to answer
 * "what happened here lately" without becoming the whole page. */
const PREVIEW = 6;

/**
 * The company's history — ONE view, not two.
 *
 * MERGED 2026-08-26. The old page had a short preview in the Overview tab
 * and the same feed in full in an Activity tab, one click apart and both
 * mounted. One of Brent's five merges.
 *
 * WHAT THE MERGE HAD TO PRESERVE, and does: the full view's period grouping
 * (Today / This week / Earlier) and its delete on calls and notes. The old
 * preview had neither, so a naive "keep the preview, drop the tab" would
 * have removed the only way to take back a mis-logged call. Both come free
 * here because this renders the SAME ActivityLogSection either way — the
 * only thing that changes is how many items it is handed.
 *
 * Activity is the one panel that is never empty: all 99 companies have at
 * least one entry, which is why this block is always open rather than
 * collapsed.
 */
export function HistoryBlock({
  accountId,
  items,
}: {
  accountId: string;
  items: CrmActivityLogItem[];
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, PREVIEW);
  const hidden = items.length - shown.length;

  return (
    <div className="flex flex-col gap-2">
      <ActivityLogSection accountId={accountId} items={shown} />
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-start text-[12px] font-semibold text-accent hover:underline"
        >
          Show all {items.length} entries
        </button>
      )}
      {showAll && items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="self-start text-[12px] font-semibold text-fg-muted hover:underline"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
