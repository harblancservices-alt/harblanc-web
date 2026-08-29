import type { ReactNode } from "react";
import type { CallPerson } from "./WhoDoICall";
import { HistoryPanel } from "./HistoryPanel";
import { TasksPanel, type FileTask } from "./TasksPanel";
import { ContactsTab } from "./ContactsTab";
import { FileBody } from "./FileBody";
import type { BolFacts } from "./bolFacts";
import type { BolDoc } from "./BolViewer";
import type { FileGap } from "./fileGaps";
import type { CrmActivityLogItem } from "../../ActivityLogSection";
import type { CompanyDefaults, RepOption } from "../../../CompanyDialog";
import type { QuickTask } from "../../../../admin/quick-task-actions";

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
  fullAddress,
  source,
  bolRole,
  stage,
  ownerLabel,
  reassign,
  onFileDays,
  createdLabel,
  gaps,
  people,
  companyPhones,
  composerContacts,
  quickTasks,
  taskOwnerLabel,
  activityItems,
  tasks,
  facts,
  bolDocs,
  linkedPanel,
  allFieldsCount,
  companyDefaults,
  reps,
  canReassign,
  nowMs,
  finalizeBanner,
  shipmentsPanel,
  shipmentCount,
}: {
  accountId: string;
  accountName: string;
  industry: string | null;
  /** crm_accounts.source, for the provenance pills on the header. */
  source: string | null;
  /** crm_accounts.bol_role, for the same. */
  bolRole: string | null;
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
  quickTasks: QuickTask[];
  taskOwnerLabel: string | null;
  activityItems: CrmActivityLogItem[];
  tasks: FileTask[];
  facts: BolFacts;
  bolDocs: BolDoc[];
  linkedPanel: ReactNode;
  allFieldsCount: number;
  companyDefaults: CompanyDefaults;
  reps: RepOption[];
  canReassign: boolean;
  nowMs: number;
  finalizeBanner?: ReactNode;
  /** ShipmentsTab, rendered on the server by the page and handed down — it
   * does its own fetch, so this tree neither knows nor cares how loads are
   * loaded. */
  shipmentsPanel: ReactNode;
  shipmentCount: number;
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
    /* A full-height flex COLUMN, so the panels below can fill the screen
       without anybody hardcoding how tall the chrome above them is. The
       first attempt used min-h-[calc(100vh-350px)] and overshot by 72px:
       the real offset is 422 on this company and it MOVES — the composer
       grows when there are contacts to pick from, the header grows when the
       subtitle wraps. A number that has to be re-derived per company is the
       wrong tool. */
    /* ── THE FRAME, DESKTOP ONLY ──────────────────────────────────────
       Brent, 2026-08-29, on a 24" 1920x1080: the profile "looks super
       stretched", runs flush to the top of the viewport, and its graphite
       header is the SAME value as the sidebar, so the two read as one
       surface with no seam.

       The fix is a gutter and an edge, NOT a column. He complained
       earlier in this project that a page "didn't fit to my screen when I
       moved it to a bigger monitor", so there is deliberately no
       max-width here: the content still uses every pixel available, it is
       just inset from the four edges and given a border.

       WHAT IT COSTS: 12px left, 16px right (the larger gutter he asked
       for, before the scrollbar) and a 1px border each side — 30px of
       horizontal working width in total. On his 1920 screen that is under
       2% of the content area and about 15px off the BOL preview column,
       which is the trade he was asked about and comfortably the right way
       round.

       EVERY UTILITY IS lg: PREFIXED. A phone has no spare width for a
       decorative frame, so at 375px this renders exactly as it did — no
       margin, no border, no rounded corners. */
    <div className="min-h-screen bg-canvas lg:p-3 lg:pr-4">
      <div className="flex min-h-screen flex-col overflow-hidden bg-canvas lg:min-h-[calc(100vh-1.5rem)] lg:rounded-xl lg:border lg:border-line-strong lg:shadow-e2">
      {/* The header is rendered by FileBody, not here: Brent's folder tabs
          live INSIDE the dark band and need to know which section is open,
          and that state belongs to FileBody. Its props are threaded through
          rather than duplicated. */}
      <FileBody
        header={{
          accountName,
          industry,
          fullAddress,
          ownerLabel,
          reassign,
          onFileDays,
          createdLabel,
          gapCount: gaps.length,
          gapSummary,
          source,
          bolRole,
        }}
        accountId={accountId}
        stage={stage}
        composerContacts={composerContacts}
        quickTasks={quickTasks}
        taskOwnerLabel={taskOwnerLabel}
        people={people}
        companyPhones={companyPhones}
        companyDefaults={companyDefaults}
        reps={reps}
        shipmentCount={shipmentCount}
        finalizeBanner={finalizeBanner}
        historyPanel={
          <HistoryPanel accountId={accountId} items={activityItems} nowMs={nowMs} />
        }
        tasksPanel={
          <TasksPanel accountId={accountId} tasks={tasks} reps={reps} canReassign={canReassign} nowMs={nowMs} />
        }
        knowProps={{
          accountId,
          companyName: accountName,
          facts,
          bolDocs,
          source,
          bolRole,
          linkedPanel,
          gaps,
          allFieldsCount,
          companyDefaults,
          reps,
        }}
        contactsPanel={
          <ContactsTab
            accountId={accountId}
            companyName={accountName}
            companyPhones={companyPhones}
            people={people}
          />
        }
        shipmentsPanel={shipmentsPanel}
      />
      </div>
    </div>
  );
}
