import { requireCrmUser } from "@/lib/crm/auth";
import { getPipelineData } from "./pipeline-data";
import { PipelineBoard } from "./PipelineBoard";

export const dynamic = "force-dynamic";

/**
 * Workspace → Pipeline — the agent's book of business as a funnel, one column
 * per lifecycle stage, drag a company to move it.
 *
 * Scoped by the SHARED visibility rule (_shell/companyVisibility.ts), so an
 * agent sees their own companies here and an unrestricted caller sees the
 * org's. No role split and no second rule.
 *
 * The stage write is the EXISTING one — accounts/actions.ts::
 * updateLifecycleStatus, the same action the company profile's stage tracker
 * calls — so moving a card logs the same transition and fires the same
 * stage-entry automation as moving it from the profile.
 */
export default async function PipelinePage() {
  const user = await requireCrmUser();
  const { cards, restricted, now } = await getPipelineData(user);

  return (
    // FULL WIDTH (Brent, 2026-08-26: "extend the pipeline and task pages to
    // the edges of the screen"). This was max-w-[1400px] with mx-auto, which
    // centred a board inside a wide screen and left a margin on both sides.
    // A board is not prose -- it has columns that want room -- so the cap is
    // gone and only the edge padding stays. Deliberately local to this page
    // rather than a change to PAGE_CONTAINER, which the other eleven
    // reading-width pages still want.
    <div className="w-full px-4 py-4 sm:px-6">
      <PipelineBoard cards={cards} restricted={restricted} now={now} />
    </div>
  );
}
