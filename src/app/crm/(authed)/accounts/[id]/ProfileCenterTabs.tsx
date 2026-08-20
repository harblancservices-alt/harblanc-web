"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Card } from "../../_shell/ui";

const TABS = [
  { key: "timeline", label: "Activity" },
  { key: "contacts", label: "Contacts" },
  { key: "shipments", label: "Shipments" },
  { key: "tasks", label: "Tasks" },
  { key: "files", label: "Documents" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The CENTER column's tabbed panel — Activity / Contacts / Shipments / Tasks
 * / Documents (no Deals/Emails tabs — neither has real backing in this CRM;
 * see page.tsx's completion notes). Default tab is Contacts, per Brent's
 * spec — crm-design's own default is "Overview," a tab the real CRM has no
 * content for (no separate summary view beyond what Contacts already
 * surfaces), so keeping the real, already-specified Contacts default here
 * rather than inventing an Overview tab with nothing real to show. Tab
 * labels renamed 2026-08-20 to match crm-design's naming exactly (was
 * "Timeline"/"Files" — the underlying components are unchanged, just the
 * label). Every panel stays mounted (just hidden) rather than swapping, so
 * client state inside one (the Contacts master-detail selection, an
 * in-flight BOL upload) survives switching tabs.
 *
 * 2026-08-20: tab-strip container split from the content Card to match
 * crm-design's Tabs component exactly — a standalone rounded bordered bar
 * (same idiom as AdminTabs.tsx) sitting above a separate content Card,
 * instead of the tab strip being attached to the top of the same Card as
 * its own panels (a border-b divider inside one shared box). Content stays
 * in ONE persistent Card (not one Card per tab, unlike crm-design) so every
 * panel can stay mounted underneath it.
 */
export function ProfileCenterTabs({
  timeline,
  timelineCount,
  contacts,
  contactsCount,
  shipments,
  shipmentsCount,
  tasks,
  tasksCount,
  files,
}: {
  timeline: ReactNode;
  timelineCount?: number;
  contacts: ReactNode;
  contactsCount?: number;
  shipments: ReactNode;
  shipmentsCount?: number;
  tasks: ReactNode;
  tasksCount?: number;
  files: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("contacts");
  const counts: Partial<Record<TabKey, number | undefined>> = {
    timeline: timelineCount,
    contacts: contactsCount,
    shipments: shipmentsCount,
    tasks: tasksCount,
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Company sections"
        className="flex gap-1 overflow-x-auto rounded-lg border border-line-strong bg-inset p-1.5 shadow-e1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-3.5 py-2.5 text-[13px] font-bold transition-all ${
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

      <Card>
        <div className={tab === "timeline" ? "" : "hidden"}>{timeline}</div>
        <div className={tab === "contacts" ? "" : "hidden"}>{contacts}</div>
        <div className={tab === "shipments" ? "" : "hidden"}>{shipments}</div>
        <div className={tab === "tasks" ? "" : "hidden"}>{tasks}</div>
        <div className={tab === "files" ? "" : "hidden"}>{files}</div>
      </Card>
    </div>
  );
}
