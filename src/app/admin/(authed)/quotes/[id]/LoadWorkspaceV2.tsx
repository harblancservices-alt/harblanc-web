import type { ReactNode } from "react";
import { IdentityRow, type IdentityRowProps } from "./IdentityRow";
import { LaneHero, type LaneHeroProps } from "./LaneHero";
import {
  StatusHero,
  type StatusHeroProps,
  type StatusHeroVariant,
} from "./StatusHero";
import { OpsStrip, type OpsStripProps } from "./OpsStrip";
import { WorkflowProgressBar } from "./WorkflowProgressBar";
import {
  BolBlockerCard,
  type BolBlockerPhase,
} from "./BolBlockerCard";
import { CollapsibleWorkspaceSection } from "./CollapsibleWorkspaceSection";

/**
 * LoadWorkspaceV2 -- workstation-style Load workspace surface.
 *
 * Top region (always visible, in priority order):
 *   1. IdentityRow -- eyebrow + customer + status + rate
 *   2. LaneHero    -- the primary visual element (city -> city + dates)
 *   3. StatusHero  -- what state we are in, what is next
 *   4. WorkflowProgressBar -- slim 10-segment progress
 *   5. OpsStrip    -- pickup / delivery / contact / next
 *
 * Bottom region (collapsible cards):
 *   LEFT column:  Load details, Customer notes, Attachments
 *   RIGHT column: BOL blocker, Documents, Pricing (post-accept this
 *                 last one defaults closed; today it stays default-open)
 *   FULL width:   Activity
 *
 * Internal forms inside the Pricing/Documents/Details cards still
 * live in the legacy DetailsTab/PricingTab/DocumentsTab components.
 * CollapsibleWorkspaceSection keeps them keep-mounted (display:none)
 * so debounced auto-save and in-flight modal state survive collapse.
 */

export type LoadWorkspaceV2Props = {
  identity: IdentityRowProps;
  lane: LaneHeroProps;
  status: StatusHeroProps;
  workflowStatus: IdentityRowProps["leadStatus"];
  ops: OpsStripProps;
  bolBlockerPhase: BolBlockerPhase | null;
  attachmentsContent?: ReactNode | null;
  attachmentsSummary?: ReactNode;
  notesContent?: ReactNode | null;
  notesSummary?: ReactNode;
  detailsContent: ReactNode;
  detailsSummary: ReactNode;
  pricingContent: ReactNode;
  pricingSummary: ReactNode;
  /** When true, Pricing collapses by default (used after acceptance). */
  pricingCollapsedByDefault?: boolean;
  documentsContent: ReactNode;
  documentsSummary: ReactNode;
  activityContent: ReactNode;
  activitySummary: ReactNode;
};

export function LoadWorkspaceV2({
  identity,
  lane,
  status,
  workflowStatus,
  ops,
  bolBlockerPhase,
  attachmentsContent,
  attachmentsSummary,
  notesContent,
  notesSummary,
  detailsContent,
  detailsSummary,
  pricingContent,
  pricingSummary,
  pricingCollapsedByDefault,
  documentsContent,
  documentsSummary,
  activityContent,
  activitySummary,
}: LoadWorkspaceV2Props) {
  const hasAttachments = attachmentsContent != null;
  const hasNotes = notesContent != null;
  const hasBolBlocker = bolBlockerPhase != null && bolBlockerPhase !== "sent";
  return (
    <div className="min-h-screen border-t border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:px-12 xl:py-8 2xl:px-16">
        <IdentityRow {...identity} />
        <LaneHero {...lane} />
        <StatusHero {...status} />
        <div className="mt-3">
          <WorkflowProgressBar currentStatus={workflowStatus} />
        </div>
        <div className="mt-3.5">
          <OpsStrip {...ops} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-4 xl:gap-5">
          <div className="space-y-3">
            <CollapsibleWorkspaceSection
              title="Load details"
              defaultOpen
              meta="Auto-saves on edit"
              summary={detailsSummary}
            >
              {detailsContent}
            </CollapsibleWorkspaceSection>

            {hasNotes ? (
              <CollapsibleWorkspaceSection
                title="Customer notes"
                defaultOpen
                summary={notesSummary}
              >
                {notesContent}
              </CollapsibleWorkspaceSection>
            ) : null}

            {hasAttachments ? (
              <CollapsibleWorkspaceSection
                title="Attachments"
                summary={attachmentsSummary}
              >
                {attachmentsContent}
              </CollapsibleWorkspaceSection>
            ) : null}
          </div>

          <div id="workspace-business" className="space-y-3">
            {hasBolBlocker ? (
              <BolBlockerCard phase={bolBlockerPhase!} />
            ) : null}

            <div id="workspace-documents">
              <CollapsibleWorkspaceSection
                title="Documents"
                defaultOpen
                summary={documentsSummary}
              >
                {documentsContent}
              </CollapsibleWorkspaceSection>
            </div>

            <div id="workspace-pricing">
              <CollapsibleWorkspaceSection
                title="Pricing"
                defaultOpen={!pricingCollapsedByDefault}
                summary={pricingSummary}
              >
                {pricingContent}
              </CollapsibleWorkspaceSection>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <CollapsibleWorkspaceSection
            title="Activity"
            defaultOpen
            summary={activitySummary}
          >
            {activityContent}
          </CollapsibleWorkspaceSection>
        </div>
      </div>
    </div>
  );
}

export type { StatusHeroVariant };
