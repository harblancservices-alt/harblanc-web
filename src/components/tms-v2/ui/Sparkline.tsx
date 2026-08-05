const TONE_STROKE = {
  positive: "var(--ok)",
  negative: "var(--bad)",
  neutral: "var(--fg-muted)",
  info: "var(--steel)",
} as const;

type SparklineProps = {
  values: number[];
  tone?: keyof typeof TONE_STROKE;
  width?: number;
  height?: number;
  /** Fill the area under the line with a soft tint of the stroke color. */
  filled?: boolean;
  className?: string;
};

/** Dependency-free inline SVG trend line — no charting library, per
 * v2-design.md's "small dependency-free chart" data-viz guidance. Renders
 * a flat mid-line for <2 points instead of throwing, so a KPI tile with
 * thin history data degrades gracefully rather than crashing. */
export function Sparkline({
  values,
  tone = "neutral",
  width = 96,
  height = 28,
  filled = true,
  className = "",
}: SparklineProps) {
  const stroke = TONE_STROKE[tone];
  const pad = 2;

  if (values.length < 2) {
    const y = height / 2;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
        <line x1={pad} y1={y} x2={width - pad} y2={y} stroke={stroke} strokeWidth={1.5} strokeDasharray="2 3" opacity={0.5} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * usableW;
    const y = pad + usableH - ((v - min) / range) * usableH;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${height - pad} L${points[0][0].toFixed(1)},${height - pad} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      {filled ? <path d={areaPath} fill={stroke} opacity={0.12} /> : null}
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
