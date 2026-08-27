import type { ReactNode } from "react";
import { FileHeader } from "./FileHeader";
import { StageStrip } from "./StageStrip";
import { WhatHappened } from "./WhatHappened";
import { WhoDoICall, type CallPerson } from "./WhoDoICall";
import { HistoryPanel } from "./HistoryPanel";
import { TasksPanel, type FileTask } from "./TasksPanel";
import { WhatWeKnow } from "./WhatWeKnow";
import { FileCard, SectionHead } from "./chrome";
import type { BolFacts } from "./bolFacts";
import type { FileGap } from "./fileGaps";
import type { CrmActivityLogItem } from "../../ActivityLogSection";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";

/**
 * THE COMPANY FILE — the desktop company page, top to bottom.
 *
 * Brent, 2026-08-26, with a mockup: "make the company page look like this
 * inch for inch."
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────
 *
 * desktop/DesktopProfile.tsx and the fourteen components under it, built
 * that same morning to Brent's "43 items down to about 25" brief. That
 * rebuild is superseded, not wrong — this design answers a different
 * question. The old tree asked "what do we hold about this company"; this
 * one asks "what do I do about them right now", which is why the composer
 * is at the top and the record is at the bottom.
 *
 * Three of its ideas survived intact and are carried here rather than
 * rebuilt: gaps derived and never stored, one edit path rather than an edit
 * control per field, and missing values rendered as the button that fixes
 * them. The files themselves stay on disk — the mobile tree still imports
 * several of them.
 *
 * ── THE SHAPE ─────────────────────────────────────────────────────────
 *
 *   dark header      who they are, who owns them, how long we have had them
 *   stage strip      where they are, and one click to move them
 *   what happened    the composer — the only place this page writes
 *   01 / 02 / 03     who to call · what was said · what is owed
 *   04               what we know, and what we still have to ask
 *
 * ── FULL BLEED, NO PAGE GUTTER ────────────────────────────────────────
 *
 * The header and the stage strip run edge to edge in the design, so this
 * tree supplies its own padding below them rather than sitting inside the
 * shell's usual `px-6`. The page hands it a container that does not pad.
 *
 * ── EVERY NUMBER ON SCREEN IS MEASURED FROM ONE INSTANT ───────────────
 *
 * `nowMs` comes down from the page. Nothing here reads the clock — the
 * React Compiler forbids it during render, and threading one value means
 * the header's "5 days", a task's "Overdue 2d" and the history's "Today"
 * cannot disagree.
 */

export function CompanyFile({
  accountId,
  accountName,
  industry,
  place,
  fullAddress,
  stage,
  ownerLabel,
  reassign,
  onFileDays,
  createdLabel,
  gaps,
  people,
  companyPhones,
  composerContacts,
  activityItems,
  tasks,
  facts,
  allFieldsCount,
  companyDefaults,
  reps,
  canReassign,
  nowMs,
  finalizeBanner,
}: {
  accountId: string;
  accountName: string;
  industry: string | null;
  place: string | null;
  fullAddress: string | null;
  stage: string;
  ownerLabel: string | null;
  reassign?: ReactNode;
  onFileDays: number;
  createdLabel: string | null;
  gaps: FileGap[];
  people: CallPerson[];
  companyPhones: { label: string; number: string }[];
  composerContacts: { id: string; name: string; phoneLabel: string | null }[];
  activityItems: CrmActivityLogItem[];
  tasks: FileTask[];
  facts: BolFacts;
  allFieldsCount: number;
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  canReassign: boolean;
  nowMs: number;
  finalizeBanner?: ReactNode;
}) {
  /** The header's sub-line under GAPS — what they actually are, in place of
   * the mockup's "1 blocks Qualified", which would state a rule this app
   * does not enforce. */
  const gapSummary =
    gaps.length === 0
      ? null
      : gaps
          .slice(0, 3)
          .map((g) => g.label.toLowerCase())
          .join(", ") + (gaps.length > 3 ? ` +${gaps.length - 3}` : "");

  return (
    <div className="bg-canvas">
      <FileHeader
        accountName={accountName}
        industry={industry}
        place={place}
        fullAddress={fullAddress}
        ownerLabel={ownerLabel}
        reassign={reassign}
        onFileDays={onFileDays}
        createdLabel={createdLabel}
        gapCount={gaps.length}
        gapSummary={gapSummary}
      />

      <StageStrip accountId={accountId} current={stage} />

      <div className="flex flex-col gap-3 p-3">
        {finalizeBanner}

        <FileCard>
          <SectionHead title="What happened" />
          <WhatHappened accountId={accountId} contacts={composerContacts} stage={stage} />
        </FileCard>

        {/* The three reading panels. `items-start` is deliberate: without it
            a short Tasks column would stretch to match a long history and
            hang its footer line in mid-air. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1.05fr)] items-stretch gap-3">
          <WhoDoICall
            accountId={accountId}
            people={people}
            companyPhones={companyPhones}
            companyDefaults={companyDefaults}
            reps={reps}
          />
          <HistoryPanel accountId={accountId} items={activityItems} nowMs={nowMs} />
          <TasksPanel tasks={tasks} reps={reps} canReassign={canReassign} nowMs={nowMs} />
        </div>

        <WhatWeKnow
          accountId={accountId}
          facts={facts}
          gaps={gaps}
          allFieldsCount={allFieldsCount}
          companyDefaults={companyDefaults}
          reps={reps}
        />
      </div>
    </div>
  );
}
