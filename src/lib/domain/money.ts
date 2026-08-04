/**
 * The money engine's formatter, ported ahead of the rest of the module.
 * Per v2-architecture.md §3a, `lib/domain/money.ts` will eventually be the
 * only file in /tms-v2 permitted to touch `rate`/`tonu_amount`/
 * `load_expenses`/`factoring_pct` (computeLoadNet, computeTripNet,
 * computeCarrierAR, computeCustomerAR) — those land once lib/data's typed
 * query layer exists to feed them (a later phase). formatMoney() ships now
 * because <Money>/<KpiTile> need it immediately: it's the only function
 * permitted to turn a number into a dollar string anywhere in /tms-v2 —
 * never an inline `toFixed(2)` or template literal at a call site.
 */

export type MoneyTone = "positive" | "negative" | "neutral";

/** Tabular-nums dollar string, e.g. formatMoney(1850) -> "$1,850". Whole
 * dollars by default (matches every figure in v2-design.md's wireframes);
 * pass `cents: true` for a value that needs sub-dollar precision. */
export function formatMoney(
  value: number | null | undefined,
  opts?: { cents?: boolean },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  }).format(value);
}

/** Semantic tone for a money figure — green for net-positive/cash-in, red
 * for spend/negative, neutral otherwise. The house rule (v2-design.md):
 * color lives only on the figure, driven by sign, never decoration. */
export function moneyTone(value: number | null | undefined): MoneyTone {
  if (value === null || value === undefined || Number.isNaN(value)) return "neutral";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}
