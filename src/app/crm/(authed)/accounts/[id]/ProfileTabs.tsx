"use client";

import { useState } from "react";
import type { ReactNode } from "react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "details", label: "Details" },
  { key: "bol", label: "BOL" },
  { key: "aiResearch", label: "AI Research" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The company profile's tab bar. A client component so the active tab is
 * local UI state, but every tab's content is handed in as plain, already
 * server-rendered ReactNode props from the profile page (an RSC) — no inline
 * function props crossing the server/client boundary. All four panels stay
 * mounted (just hidden) rather than swapping, so client state inside a panel
 * (e.g. the Notes composer, or the BOL uploader's in-flight state) survives
 * switching tabs. "Overview" is the operational two-column landing (company
 * left, tasks + notes + call log + activity right); "Contacts" holds the full
 * people list plus the Stray numbers cleanup section, split out on its own
 * since a company can carry 3-5+ contacts that would otherwise crowd
 * Overview; "Details" holds the exhaustive field set that doesn't belong in
 * daily operational use.
 */
export function ProfileTabs({
  overview,
  contacts,
  contactsCount,
  details,
  bol,
  bolCount,
  aiResearch,
  aiResearchCount,
}: {
  overview: ReactNode;
  contacts: ReactNode;
  contactsCount?: number;
  details: ReactNode;
  bol: ReactNode;
  bolCount?: number;
  aiResearch: ReactNode;
  aiResearchCount?: number;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Company profile sections"
        className="mb-4 flex gap-1 rounded-xl border border-line-strong bg-card p-1 shadow-e2"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors sm:flex-none sm:px-5 ${
              tab === t.key
                ? "bg-accent text-white"
                : "text-fg-muted hover:bg-inset hover:text-fg"
            }`}
          >
            {t.label}
            {t.key === "contacts" && contactsCount ? (
              <span
                className={`ml-1.5 font-mono tabular-nums ${
                  tab === t.key ? "text-white/80" : "text-fg-subtle"
                }`}
              >
                {contactsCount}
              </span>
            ) : null}
            {t.key === "bol" && bolCount ? (
              <span
                className={`ml-1.5 font-mono tabular-nums ${
                  tab === t.key ? "text-white/80" : "text-fg-subtle"
                }`}
              >
                {bolCount}
              </span>
            ) : null}
            {t.key === "aiResearch" && aiResearchCount ? (
              <span
                className={`ml-1.5 font-mono tabular-nums ${
                  tab === t.key ? "text-white/80" : "text-fg-subtle"
                }`}
              >
                {aiResearchCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={tab === "overview" ? "space-y-4" : "hidden"}>{overview}</div>
      <div className={tab === "contacts" ? "space-y-4" : "hidden"}>{contacts}</div>
      <div className={tab === "details" ? "space-y-4" : "hidden"}>{details}</div>
      <div className={tab === "bol" ? "space-y-4" : "hidden"}>{bol}</div>
      <div className={tab === "aiResearch" ? "space-y-4" : "hidden"}>{aiResearch}</div>
    </div>
  );
}
