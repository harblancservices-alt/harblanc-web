import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * V2 "Fleet Ops" status tag / badge. Colored text on a ~12% tint with a small
 * leading dot; 4px radius. Presentational only. Five semantic tones mapped to
 * the V2 status tokens.
 */

export type StatusTone = "green" | "amber" | "red" | "steel" | "slate";

const TONE: Record<StatusTone, string> = {
  green: "bg-ok-bg text-ok",
  amber: "bg-warn-bg text-warn",
  red: "bg-bad-bg text-bad",
  steel: "bg-steel-bg text-steel",
  slate: "bg-slate-bg text-slate",
};

const DOT: Record<StatusTone, string> = {
  green: "bg-ok",
  amber: "bg-warn",
  red: "bg-bad",
  steel: "bg-steel",
  slate: "bg-slate",
};

type StatusTagProps = {
  tone?: StatusTone;
  /** Hide the leading dot (text-only badge). */
  hideDot?: boolean;
  children?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"span">, "className" | "children">;

export function StatusTag({
  tone = "slate",
  hideDot = false,
  children,
  className,
  ...rest
}: StatusTagProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] leading-none",
        TONE[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {hideDot ? null : (
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`}
        />
      )}
      {children}
    </span>
  );
}
