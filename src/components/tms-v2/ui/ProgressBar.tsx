const TONE_FILL = {
  positive: "bg-ok",
  negative: "bg-bad",
  warning: "bg-warn",
  info: "bg-steel",
  accent: "bg-accent",
} as const;

type ProgressBarProps = {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  tone?: keyof typeof TONE_FILL;
  /** Optional label rendered above the bar, e.g. "Net pace". */
  label?: string;
  /** Optional trailing value text, e.g. "72%" or "$18,400 / $24,000". */
  valueLabel?: string;
  className?: string;
};

/** Horizontal progress/meter bar — goal pace, margin %, capacity, etc. One
 * shared implementation instead of ad hoc `▓▓▓░░` text or per-page divs. */
export function ProgressBar({ value, tone = "accent", label, valueLabel, className = "" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      {label || valueLabel ? (
        <div className="mb-1.5 flex items-center justify-between text-[13px]">
          {label ? <span className="font-medium text-fg-muted">{label}</span> : <span />}
          {valueLabel ? <span className="font-medium text-fg">{valueLabel}</span> : null}
        </div>
      ) : null}
      <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
        <div
          className={`h-full rounded-full ${TONE_FILL[tone]} transition-[width] duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
