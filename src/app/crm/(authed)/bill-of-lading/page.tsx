import { requireCrmUser } from "@/lib/crm/auth";
import { PageShell } from "../_shell/ui";
import { BillOfLadingGenerator } from "./BillOfLadingGenerator";

export const dynamic = "force-dynamic";

/**
 * Bill of Lading generator: a left-side fill-in form paired with a live
 * document preview on the right, printed via the same "hide everything but
 * the print area" trick as /crm/rate-confirmation. Unlike that route, every
 * field here is controlled React state (not uncontrolled inputs) so the
 * preview can re-render as-you-type with blank underlines instead of
 * bracket placeholders. No data fetching, no persistence — stays a Server
 * Component only for the requireCrmUser() auth gate, consistent with every
 * other /crm page.
 */
export default async function BillOfLadingPage() {
  await requireCrmUser();

  return (
    <PageShell>
      <BillOfLadingGenerator />
    </PageShell>
  );
}
