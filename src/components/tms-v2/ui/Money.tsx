import { formatMoney, moneyTone, type MoneyTone } from "@/lib/domain/money";

const TONE_CLASSES: Record<MoneyTone, string> = {
  positive: "text-ok",
  negative: "text-bad",
  neutral: "text-fg",
};

type MoneyProps = {
  value: number | null | undefined;
  /** "auto" colors by sign (default); "none" renders in --fg regardless of
   * sign (use where color would be redundant, e.g. already inside a colored
   * context); or pin an explicit tone. */
  tone?: MoneyTone | "auto" | "none";
  cents?: boolean;
  className?: string;
};

/** Single-value inline money figure — tabular-nums, semantic color only on
 * the figure, always through formatMoney() (v2-architecture.md §3a). Never
 * a literal `$${value}` or inline `toFixed(2)` at a call site. */
export function Money({ value, tone = "auto", cents, className = "" }: MoneyProps) {
  const resolvedTone: MoneyTone = tone === "auto" ? moneyTone(value) : tone === "none" ? "neutral" : tone;
  return (
    <span className={`font-mono tabular-nums ${TONE_CLASSES[resolvedTone]} ${className}`}>
      {formatMoney(value, { cents })}
    </span>
  );
}
