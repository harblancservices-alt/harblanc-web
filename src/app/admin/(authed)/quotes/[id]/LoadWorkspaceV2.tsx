import type { ReactNode } from "react";
import { type IdentityRowProps } from "./IdentityRow";
import { type LaneHeroProps } from "./LaneHero";
import {
  type StatusHeroProps,
  type StatusHeroVariant,
} from "./StatusHero";
import { type OpsStripProps } from "./OpsStrip";
import { type BolBlockerPhase } from "./BolBlockerCard";
import { CollapsibleWorkspaceSection } from "./CollapsibleWorkspaceSection";
import { DocumentsActivityTabs } from "./DocumentsActivityTabs";

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
  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8 xl:px-10 xl:py-8">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.05fr)] xl:gap-4">
          {/* LEFT — load details + reference */}
          <div className="space-y-3 lg:col-span-2 xl:col-span-1">
            <CollapsibleWorkspaceSection
              title="Load details"
              defaultOpen
              meta="Auto-saves on edit"
              summary={detailsSummary}
            >
              {detailsContent}
            </CollapsibleWorkspaceSection>

            <CollapsibleWorkspaceSection
              title="Notes & attachments"
              meta="Reference"
              defaultOpen
              summary={notesSummary ?? attachmentsSummary}
            >
              <div className="divide-y divide-line py-1">
                <div className="py-2">
                  <p className="mb-1 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                    Customer notes
                  </p>
                  {hasNotes ? (
                    notesContent
                  ) : (
                    <p className="px-3 pb-1 text-[12px] text-fg-subtle">
                      No notes from the customer.
                    </p>
                  )}
                </div>
                <div className="py-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2 px-3">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                      Attachments
                    </p>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-subtle">
                      {attachmentsSummary ?? "From customer intake"}
                    </span>
                  </div>
                  {hasAttachments ? (
                    attachmentsContent
                  ) : (
                    <div className="mx-3 mb-1 rounded-md border-2 border-dashed border-line-strong px-3 py-5 text-center">
                      <p className="text-[12px] font-semibold text-fg-muted">
                        No attachments yet
                      </p>
                      <p className="mt-0.5 text-[11px] text-fg-subtle">
                        Files the customer uploads (BOL, photos, permits) appear here.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleWorkspaceSection>
          </div>

          {/* MIDDLE — pricing */}
          <div id="workspace-pricing" className="space-y-3">
            <CollapsibleWorkspaceSection
              title="Pricing"
              defaultOpen={!pricingCollapsedByDefault}
              summary={pricingSummary}
            >
              {pricingContent}
            </CollapsibleWorkspaceSection>
          </div>

          {/* RIGHT — documents + activity (tabbed) */}
          <div id="workspace-business" className="space-y-3">
            <div id="workspace-documents">
              <DocumentsActivityTabs
                documentsContent={documentsContent}
                documentsSummary={documentsSummary}
                activityContent={activityContent}
                activitySummary={activitySummary}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { StatusHeroVariant };
