import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * V2 "Fleet Ops" surface primitives. Presentational only — no behaviour, no
 * data, no wiring. Pages adopt these in a later phase; for now they just exist
 * so the token layer has consumers.
 *
 *   Card      → resting white surface: 6px radius, e1 shadow + hairline, 20px pad.
 *   KPI       → interactive metric tile: e2 shadow, large tabular value, 11px
 *               uppercase label, optional up/down delta chip.
 *   FocalKPI  → the hero metric: graphite background, light text, 3px accent
 *               left edge. One per view, max.
 */

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cx(
        "rounded-md border border-line bg-card p-5 shadow-e1",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export type KpiDelta = {
  /** Arrow direction; also picks the default tint (up = ok, down = bad). */
  direction: "up" | "down";
  /** Short text shown in the chip, e.g. "+12%". */
  label: string;
};

type KpiProps = {
  label: ReactNode;
  value: ReactNode;
  /** Optional sub-line under the value (units, context). */
  sub?: ReactNode;
  delta?: KpiDelta;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "className">;

const LABEL = "text-[11px] font-bold uppercase tracking-[0.08em]";

function DeltaChip({ delta }: { delta: KpiDelta }) {
  const up = delta.direction === "up";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
        up ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad",
      )}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {delta.label}
    </span>
  );
}

export function KPI({ label, value, sub, delta, className, ...rest }: KpiProps) {
  return (
    <div
      className={cx(
        "rounded-md border border-line bg-card p-5 shadow-e2",
        className,
      )}
      {...rest}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cx(LABEL, "text-ink-3")}>{label}</span>
        {delta ? <DeltaChip delta={delta} /> : null}
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none tabular-nums text-ink">
        {value}
      </div>
      {sub ? <div className="mt-1 text-[12px] text-ink-2">{sub}</div> : null}
    </div>
  );
}

export function FocalKPI({
  label,
  value,
  sub,
  delta,
  className,
  ...rest
}: KpiProps) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-md bg-graphite p-5 pl-6 shadow-e2",
        className,
      )}
      {...rest}
    >
      {/* 3px accent left edge */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-accent"
      />
      <div className="flex items-start justify-between gap-3">
        <span className={cx(LABEL, "text-on-dark-dim")}>{label}</span>
        {delta ? <DeltaChip delta={delta} /> : null}
      </div>
      <div className="mt-2 text-[32px] font-bold leading-none tabular-nums text-white">
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-[12px] text-on-dark-dim">{sub}</div>
      ) : null}
    </div>
  );
}
