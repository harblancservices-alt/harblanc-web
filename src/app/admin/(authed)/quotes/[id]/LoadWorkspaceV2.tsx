import type { ReactNode } from "react";
import { WorkspaceHeader, type WorkspaceHeaderProps } from "./WorkspaceHeader";
import { WorkspaceSection } from "./WorkspaceSection";

/**
 * LoadWorkspaceV2 — unified single-page Load detail surface.
 *
 * Replaces the V3 tabbed QuoteWorkspaceTabs UI. No tabs. Same page,
 * everything visible at once on a single vertical scroll.
 *
 * Layout (desktop, lg and up):
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ Dark header (back, identity, status, rate, workflow)   │
 *   ├──────────────────────────┬─────────────────────────────┤
 *   │ LEFT 60%                 │ RIGHT 40%                   │
 *   │  - Overview              │  - Pricing                  │
 *   │  - Details (editor)      │  - Documents                │
 *   ├──────────────────────────┴─────────────────────────────┤
 *   │ Bottom                                                 │
 *   │  - Activity timeline                                   │
 *   └────────────────────────────────────────────────────────┘
 *
 * Mobile (< lg): everything stacks vertically in the same order.
 *
 * The inner tab content components (overview / details / pricing /
 * documents / activity) are passed in as already-rendered ReactNode
 * children — page.tsx assembles them and hands them down. This keeps
 * the wrapper agnostic to the props of each tab, which is critical
 * because we are NOT touching those props for Phase A.
 *
 * Each section renders inside a WorkspaceSection — dark eyebrow bar
 * with a white inner body so the existing light tab content has the
 * surface it expects. Phase B will port the inner components to dark
 * Tailwind classes and we'll swap WorkspaceSection's inner bg to
 * `bg-zinc-950` then.
 */

export type LoadWorkspaceV2Props = {
  header: WorkspaceHeaderProps;
  overviewContent: ReactNode;
  detailsContent: ReactNode;
  pricingContent: ReactNode;
  documentsContent: ReactNode;
  activityContent: ReactNode;
};

export function LoadWorkspaceV2({
  header,
  overviewContent,
  detailsContent,
  pricingContent,
  documentsContent,
  activityContent,
}: LoadWorkspaceV2Props) {
  return (
    <div className="min-h-screen border-t border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <WorkspaceHeader {...header} />

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-3">
            <WorkspaceSection title="Overview">
              {overviewContent}
            </WorkspaceSection>

            <WorkspaceSection
              title="Load details"
              meta="Auto-saves on edit"
            >
              {detailsContent}
            </WorkspaceSection>
          </div>

          <div className="space-y-3">
            <WorkspaceSection title="Pricing">
              {pricingContent}
            </WorkspaceSection>

            <WorkspaceSection title="Documents">
              {documentsContent}
            </WorkspaceSection>
          </div>
        </div>

        <div className="mt-3">
          <WorkspaceSection title="Activity">
            {activityContent}
          </WorkspaceSection>
        </div>
      </div>
    </div>
  );
}
