"use client";

import { useState, type ReactNode } from "react";

/**
 * DocumentsActivityTabs — one panel, two tabs (Documents | Activity)
 * sharing a single dark header bar. Both panes stay mounted (the inactive
 * one is hidden with display:none) so nothing re-renders or loses state on
 * tab switch. Matches the CollapsibleWorkspaceSection look so it reads as
 * the same family of panels.
 */
export function DocumentsActivityTabs({
  documentsContent,
  documentsSummary,
  activityContent,
  activitySummary,
}: {
  documentsContent: ReactNode;
  documentsSummary?: ReactNode;
  activityContent: ReactNode;
  activitySummary?: ReactNode;
}) {
  const [tab, setTab] = useState<"documents" | "activity">("documents");
  const isDocs = tab === "documents";

  return (
    <section className="overflow-hidden rounded-md border border-line bg-card shadow-md">
      <div className="flex items-center justify-between gap-3 bg-bar px-2 py-1.5">
        <div className="flex items-center gap-1">
          <TabButton active={isDocs} onClick={() => setTab("documents")}>
            Documents
          </TabButton>
          <TabButton active={!isDocs} onClick={() => setTab("activity")}>
            Activity
          </TabButton>
        </div>
        <span className="truncate pr-1.5 font-mono text-[11px] tabular-nums text-bar-fg/85">
          {isDocs ? documentsSummary : activitySummary}
        </span>
      </div>
      <div className="bg-card text-fg">
        <div className={isDocs ? undefined : "hidden"}>{documentsContent}</div>
        <div className={isDocs ? "hidden" : undefined}>{activityContent}</div>
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-sm px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors " +
        (active ? "bg-card text-fg" : "text-bar-fg/55 hover:text-bar-fg")
      }
    >
      {children}
    </button>
  );
}
