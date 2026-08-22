import { QuoteCalculator } from "./QuoteCalculator";

export const dynamic = "force-dynamic";

/**
 * Operations → Quote Calculator. The section's landing tab (it owns the bare
 * /crm/operations route — see OperationsTabs).
 *
 * A thin Server Component over an entirely client-side calculator: the math
 * is a pure function (./quotePricing.ts) run in the browser as the rep
 * types, so there's nothing to fetch here, no server action, and no route
 * handler. No props cross the RSC boundary at all.
 *
 * The formula is a house assumption, not an audited rate model — a blended
 * hourly rate driven off miles/avg speed, plus diesel, plus the brokerage
 * percentage on top. Every input is editable per quote and the panel says
 * out loud that it's an estimate.
 */
export default function OperationsQuoteCalculatorPage() {
  return <QuoteCalculator />;
}
