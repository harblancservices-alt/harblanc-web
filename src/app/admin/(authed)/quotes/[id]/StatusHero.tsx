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
    box: "border-amber-300 border-l-[4px] border-l-amber-500 bg-amber-50",
    eyebrow: "text-amber-700",
    headline: "text-amber-900",
    detail: "text-amber-800",
    meta: "text-amber-700",
  },
  blue: {
    box: "border-blue-300 border-l-[4px] border-l-blue-500 bg-blue-50",
    eyebrow: "text-blue-700",
    headline: "text-blue-900",
    detail: "text-blue-800",
    meta: "text-blue-700",
  },
  emerald: {
    box: "border-emerald-300 border-l-[4px] border-l-emerald-500 bg-emerald-50",
    eyebrow: "text-emerald-700",
    headline: "text-emerald-900",
    detail: "text-emerald-800",
    meta: "text-emerald-700",
  },
  neutral: {
    box: "border-line-strong border-l-[4px] border-l-line-strong bg-elevated",
    eyebrow: "text-fg-subtle",
    headline: "text-fg",
    detail: "text-fg-muted",
    meta: "text-fg-subtle",
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
      className={"border-t px-4 py-2.5 sm:px-5 " + c.box}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p
          className={
            "font-mono text-[9px] font-semibold uppercase tracking-[0.18em] xl:text-[10px] " +
            c.eyebrow
          }
        >
          {eyebrow ?? "Current status"}
        </p>
        <h2
          className={
            "text-[15px] font-semibold leading-tight tracking-tight sm:text-[16px] " +
            c.headline
          }
        >
          {headline}
        </h2>
        {metaText ? (
          <p
            className={
              "font-mono text-[10px] uppercase tracking-[0.12em] " + c.meta
            }
          >
            &middot; {metaText}
          </p>
        ) : null}
        {actions ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {detailText ? (
        <p className={"mt-0.5 text-[12px] " + c.detail}>{detailText}</p>
      ) : null}
    </section>
  );
}
