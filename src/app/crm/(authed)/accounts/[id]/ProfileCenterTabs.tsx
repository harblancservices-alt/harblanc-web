"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Card } from "../../_shell/ui";

const TABS = [
  { key: "timeline", label: "Timeline" },
  { key: "contacts", label: "Contacts" },
  { key: "tasks", label: "Tasks" },
  { key: "notes", label: "Notes" },
  { key: "files", label: "Files" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The CENTER column's tabbed panel — Timeline / Contacts / Tasks / Notes /
 * Files (no Deals/Emails tabs — neither has real backing in this CRM; see
 * page.tsx's completion notes). Default tab is Contacts, per Brent's spec.
 * Every panel stays mounted (just hidden) rather than swapping, so client
 * state inside one (the Contacts master-detail selection, an in-flight BOL
 * upload) survives switching tabs — same reasoning the old ProfileTabs used.
 */
export function ProfileCenterTabs({
  timeline,
  timelineCount,
  contacts,
  contactsCount,
  tasks,
  tasksCount,
  notes,
  notesCount,
  files,
}: {
  timeline: ReactNode;
  timelineCount?: number;
  contacts: ReactNode;
  contactsCount?: number;
  tasks: ReactNode;
  tasksCount?: number;
  notes: ReactNode;
  notesCount?: number;
  files: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("contacts");
  const counts: Partial<Record<TabKey, number | undefined>> = {
    timeline: timelineCount,
    contacts: contactsCount,
    tasks: tasksCount,
    notes: notesCount,
  };

  return (
    <Card>
      <div role="tablist" aria-label="Company sections" className="flex gap-1 overflow-x-auto border-b border-line-strong bg-inset p-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3.5 py-2.5 text-[13px] font-bold transition-all ${
              tab === t.key ? "bg-card text-accent shadow-e2 ring-1 ring-line-strong" : "text-fg-muted hover:bg-card/60 hover:text-fg"
            }`}
          >
            {t.label}
            {counts[t.key] ? (
              <span className={`ml-1.5 font-mono tabular-nums ${tab === t.key ? "text-accent/70" : "text-fg-subtle"}`}>
                {counts[t.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={tab === "timeline" ? "" : "hidden"}>{timeline}</div>
      <div className={tab === "contacts" ? "" : "hidden"}>{contacts}</div>
      <div className={tab === "tasks" ? "" : "hidden"}>{tasks}</div>
      <div className={tab === "notes" ? "" : "hidden"}>{notes}</div>
      <div className={tab === "files" ? "" : "hidden"}>{files}</div>
    </Card>
  );
}
