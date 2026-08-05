const TONE_CLASSES = {
  positive: "text-ok",
  negative: "text-bad",
  neutral: "text-fg-muted",
} as const;

type TrendArrowProps = {
  /** Percent change, e.g. 12.4 -> "+12.4%", -8 -> "-8%". */
  percent: number;
  /** "auto" colors up=positive/down=negative (default); pass "inverse" for
   * metrics where a decrease is the good outcome (e.g. deadhead %). */
  direction?: "auto" | "inverse";
  className?: string;
};

/** Up/down arrow + signed percent, colored by sign (green=up, red=down by
 * default). One shared implementation for every delta figure instead of
 * per-page arrow glyphs + inline color logic. */
export function TrendArrow({ percent, direction = "auto", className = "" }: TrendArrowProps) {
  const isUp = percent > 0;
  const isFlat = percent === 0;
  const tone = isFlat
    ? "neutral"
    : direction === "inverse"
      ? isUp
        ? "negative"
        : "positive"
      : isUp
        ? "positive"
        : "negative";

  return (
    <span className={`inline-flex items-center gap-0.5 text-[13px] font-medium ${TONE_CLASSES[tone]} ${className}`}>
      {isFlat ? (
        <span aria-hidden>—</span>
      ) : (
        <svg
          viewBox="0 0 10 10"
          className={`h-3 w-3 ${isUp ? "" : "rotate-180"}`}
          aria-hidden
          fill="currentColor"
        >
          <path d="M5 1 L9 7 L6 7 L6 9.5 L4 9.5 L4 7 L1 7 Z" />
        </svg>
      )}
      {isFlat ? "0%" : `${isUp ? "+" : ""}${percent.toFixed(1)}%`}
    </span>
  );
}
