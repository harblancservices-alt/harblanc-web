"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { D_H3, D_LINK } from "./ui";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "shipments", label: "Shipments" },
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * DESKTOP-ONLY workspace card (design handoff §Main column) — the tab bar
 * whose active tab reads as a white card-top attached to the panel below it,
 * with count pills on Activity/Tasks.
 *
 * Structurally the handoff's; behaviorally identical to the mobile
 * ProfileCenterTabs it sits beside: every panel stays MOUNTED (just hidden)
 * so in-flight client state inside one — a half-typed note, a BOL upload —
 * survives a tab switch. All five panels are the existing components,
 * unmodified and passed in as ReactNode from the Server Component page (no
 * function props cross the boundary; see the standing RSC rule).
 *
 * Overview is the handoff's default landing tab and is the one genuinely new
 * panel: a preview of the same activity feed the Activity tab renders in
 * full, over the same Notes component the mobile layout puts in its own card
 * below the tabs. "View all" just flips to the Activity tab.
 *
 * There's no Contacts tab here — the desktop layout moves the roster into
 * the left rail's contact wheel, per the handoff.
 */
export function WorkspaceTabs({
  overviewActivity,
  overviewNotes,
  activity,
  activityCount,
  shipments,
  tasks,
  tasksCount,
  documents,
  notesCount,
}: {
  /** Activity PREVIEW for the Overview panel (desktop/ActivityFeed). */
  overviewActivity: ReactNode;
  /** The shared NotesTab, rendered inside the Overview panel. */
  overviewNotes: ReactNode;
  notesCount: number;
  /** Full Activity tab — the existing ActivityLogSection. */
  activity: ReactNode;
  activityCount: number;
  shipments: ReactNode;
  tasks: ReactNode;
  tasksCount: number;
  documents: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const counts: Partial<Record<TabKey, number>> = { activity: activityCount, tasks: tasksCount };

  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-card shadow-e2">
      <div role="tablist" aria-label="Company workspace" className="flex gap-0.5 border-b border-line-strong bg-inset px-3 pt-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative top-px flex items-center gap-1.5 rounded-t-lg border border-b-0 px-4 py-2.5 text-[13px] transition-colors ${
                active
                  ? "border-line-strong bg-card font-bold text-fg"
                  : "border-transparent font-semibold text-fg-muted hover:text-fg"
              }`}
            >
              {t.label}
              {count ? (
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                    active ? "bg-accent text-white" : "bg-line-strong text-fg"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={tab === "overview" ? "flex flex-col gap-6 p-5" : "hidden"}>
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className={D_H3}>Recent activity</h3>
            {activityCount > 0 && (
              <button type="button" onClick={() => setTab("activity")} className={D_LINK}>
                View all · {activityCount}
              </button>
            )}
          </div>
          {overviewActivity}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className={D_H3}>
              Notes{" "}
              {notesCount > 0 && <span className="font-medium text-fg-muted">· {notesCount} on file</span>}
            </h3>
          </div>
          {/* NotesTab supplies its own padding for the mobile card it also
              renders in — pulled back flush here so it lines up with the
              Recent-activity block above it. */}
          <div className="-mx-4 -my-4 sm:-mx-5">{overviewNotes}</div>
        </div>
      </div>

      <div className={tab === "activity" ? "" : "hidden"}>{activity}</div>
      <div className={tab === "shipments" ? "" : "hidden"}>{shipments}</div>
      <div className={tab === "tasks" ? "" : "hidden"}>{tasks}</div>
      <div className={tab === "documents" ? "" : "hidden"}>{documents}</div>
    </div>
  );
}
