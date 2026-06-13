import type { ReactNode } from "react";

/**
 * StatusHero — the second hero block under the LaneHero.
 *
 * A bordered, centered card that answers "what state is this load in
 * and what's my next move?" in a single glance. Tone is driven by the
 * variant; same shape across the lifecycle.
 *
 *  - amber   → waiting on the customer (sent quote, sent finalized, etc.)
 *  - blue    → action needed from us   (new lead, needs pricing, etc.)
 *  - emerald → terminal success        (paid, archived)
 *  - neutral → ambient / informational
 *
 * Actions are an optional ReactNode slot — wired by the parent. Wiring
 * lives outside this presentational shell so we don't touch the
 * underlying server actions or flows from here.
 */

export type StatusHeroVariant = "amber" | "blue" | "emerald" | "neutral";

export type StatusHeroProps = {
  variant: StatusHeroVariant;
  eyebrow?: string;
  headline: string;
  /** Optional sub-line, plain prose (e.g. "Sent 12 min ago to alice@x.com"). */
  detail?: string | null;
  /** Optional all-caps mono line under the detail (e.g. "Follow up tomorrow at 14:30"). */
  meta?: string | null;
  /** Optional action slot — buttons / links provided by parent. */
  actions?: ReactNode;
};

const VARIANT_CLASSES: Record<
  StatusHeroVariant,
  {
    box: string;
    eyebrow: string;
    headline: string;
    detail: string;
    meta: string;
  }
> = {
  amber: {
    box: "border-amber-700/70 border-l-[4px] border-l-amber-500 bg-amber-950/30",
    eyebrow: "text-amber-400",
    headline: "text-amber-50",
    detail: "text-amber-100/80",
    meta: "text-amber-100/70",
  },
  blue: {
    box: "border-blue-700/70 border-l-[4px] border-l-blue-500 bg-blue-950/30",
    eyebrow: "text-blue-400",
    headline: "text-blue-50",
    detail: "text-blue-100/85",
    meta: "text-blue-100/70",
  },
  emerald: {
    box: "border-emerald-700/70 border-l-[4px] border-l-emerald-500 bg-emerald-950/30",
    eyebrow: "text-emerald-400",
    headline: "text-emerald-50",
    detail: "text-emerald-100/80",
    meta: "text-emerald-100/70",
  },
  neutral: {
    box: "border-zinc-700 border-l-[4px] border-l-zinc-500 bg-zinc-900/50",
    eyebrow: "text-zinc-400",
    headline: "text-zinc-100",
    detail: "text-zinc-300",
    meta: "text-zinc-400",
  },
};

export function StatusHero({
  variant,
  eyebrow,
  headline,
  detail,
  meta,
  actions,
}: StatusHeroProps) {
  const c = VARIANT_CLASSES[variant];
  const detailText = (detail ?? "").trim();
  const metaText = (meta ?? "").trim();
  return (
    <section
      role="status"
      aria-label="Current status"
      className={
        "rounded-md border px-4 py-4 text-center sm:px-5 sm:py-5 xl:px-6 xl:py-6 " + c.box
      }
    >
      <p
        className={
          "font-mono text-[9.5px] font-medium uppercase tracking-[0.28em] xl:text-[11px] " +
          c.eyebrow
        }
      >
        {eyebrow ?? "Current status"}
      </p>
      <h2
        className={
          "mt-2 text-[19px] font-medium leading-tight tracking-tight sm:text-[21px] xl:text-[26px] 2xl:text-[28px] " +
          c.headline
        }
      >
        {headline}
      </h2>
      {detailText ? (
        <p className={"mt-1 text-[12px] sm:text-[12.5px] xl:text-[14px] " + c.detail}>
          {detailText}
        </p>
      ) : null}
      {metaText ? (
        <p
          className={
            "mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] xl:text-[12px] " +
            c.meta
          }
        >
          {metaText}
        </p>
      ) : null}
      {actions ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
