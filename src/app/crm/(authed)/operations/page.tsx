import { ComingSoonPanel } from "./ComingSoonPanel";
import { IconRateConfirmation } from "../_shell/icons";

export const dynamic = "force-dynamic";

/**
 * Operations → Quote Calculator. The section's landing tab (it owns the bare
 * /crm/operations route — see OperationsTabs).
 *
 * Placeholder on purpose: the pricing formula is still Brent's call
 * (roughly hourly rate + fuel + a brokerage percentage on top, exact numbers
 * TBD), and shipping a calculator against a guessed formula would put wrong
 * money in front of a rep. Nothing is computed, stored, or implied here
 * until the real formula lands.
 */
export default function OperationsQuoteCalculatorPage() {
  return (
    <ComingSoonPanel
      title="Quote Calculator"
      hint="Price a load before you send it"
      icon={<IconRateConfirmation width={22} height={22} />}
      headline="Coming soon"
      body="Enter a lane and the load's details, and this will price the job — labor, fuel, and the brokerage fee on top — with a line-by-line breakdown you can quote from. Waiting on the final formula before it goes live."
    />
  );
}
