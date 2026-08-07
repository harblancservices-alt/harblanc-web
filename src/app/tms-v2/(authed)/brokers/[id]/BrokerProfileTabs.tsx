"use client";

import { useState, type ReactNode } from "react";

type TabId = "overview" | "contacts" | "documents" | "history";

/**
 * Tab switcher for everything below the profile header — mirrors legacy's
 * Overview/Contacts/Documents/Load History tab bar (BrokerDetail.tsx),
 * the part of the old broker profile Brent liked and asked to keep. Panels
 * are pre-rendered ReactNode "slot" children built by the Server Component
 * page (same pattern as PortalShell/ContextDrawer) — all four render at
 * once and the inactive ones are just hidden, so this stays the only
 * client boundary on the page.
 */
export function BrokerProfileTabs({
  contactsCount,
  historyCount,
  overview,
  contacts,
  documents,
  history,
}: {
  contactsCount: number;
  historyCount: number;
  overview: ReactNode;
  contacts: ReactNode;
  documents: ReactNode;
  history: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("overview");

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "contacts", label: `Contacts${contactsCount ? ` (${contactsCount})` : ""}` },
    { id: "documents", label: "Documents" },
    { id: "history", label: `Load History${historyCount ? ` (${historyCount})` : ""}` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              tab === t.id ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={tab === "overview" ? "" : "hidden"}>{overview}</div>
      <div className={tab === "contacts" ? "" : "hidden"}>{contacts}</div>
      <div className={tab === "documents" ? "" : "hidden"}>{documents}</div>
      <div className={tab === "history" ? "" : "hidden"}>{history}</div>
    </div>
  );
}
