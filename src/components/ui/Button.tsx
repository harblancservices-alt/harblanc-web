import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Site-wide admin button — one component, six variants. The variant names are
 * kept (chosen BY FUNCTION so pages don't have to re-pick), but under the V2
 * "Fleet Ops" system the saturated blue/amber/slate FILLS are neutralized: the
 * accent red is now reserved for the single primary action, everything neutral
 * shares one calm secondary look, and destructive stays red-outlined.
 *
 *   primary     → SOLID accent red, white text. The main do-it/commit action
 *                 (Save, Update, Add load, New trip, Send, Build preview …).
 *   navigate    → NEUTRAL secondary (white fill + line-strong border + ink
 *                 text). Was blue-filled. Back / jump-to-page buttons.
 *   edit        → NEUTRAL secondary. Was amber-filled. "Edit this thing".
 *   utility     → NEUTRAL secondary. Was slate-filled. Document-add buttons
 *                 (+ Rate Con / + BOL / + POD).
 *   cancel      → NEUTRAL secondary. Modal Cancel / dismiss buttons.
 *   destructive → RED border, WHITE fill, RED text. Delete / Remove / Trash /
 *                 Cancel load — distinct from primary so a delete never reads
 *                 like a save.
 *
 * Only colors/radius/height change here; every variant name, prop, icon, and
 * the button-vs-Link behaviour are identical. This is a styling layer only —
 * behaviour/links/actions/form submission are unchanged.
 */

export type ButtonVariant =
  | "navigate"
  | "edit"
  | "primary"
  | "destructive"
  | "cancel"
  | "utility";

export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-mono font-semibold uppercase leading-none tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

// The neutralized secondary look shared by navigate / edit / utility / cancel:
// white surface, strong hairline, ink text, inset hover. No saturated fill.
const SECONDARY =
  "border border-line-strong bg-card text-ink hover:bg-inset disabled:hover:bg-card";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover",
  navigate: SECONDARY,
  edit: SECONDARY,
  utility: SECONDARY,
  cancel: SECONDARY,
  destructive:
    "border border-bad bg-card text-bad hover:bg-bad-bg disabled:hover:bg-card",
};

// 6px radius (rounded-md). Compact, refined proportions — a fixed height keeps
// them tidy on mobile (no ballooning min-height): md ≈ 34px, sm ≈ 30px. Label
// ~13px / 600 weight. Comfortable to tap without dominating the screen.
const SIZE: Record<ButtonSize, string> = {
  sm: "h-[30px] px-3 text-[12px]",
  md: "h-[34px] px-3.5 text-[13px]",
};

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Icon (or any node) rendered before the label. */
  leftIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = BaseProps &
  Omit<ComponentPropsWithoutRef<"button">, "className"> & { href?: undefined };

type ButtonAsLink = BaseProps &
  Omit<ComponentPropsWithoutRef<"a">, "className" | "href"> & {
    href: string;
    prefetch?: boolean;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  className?: string,
): string {
  return [
    BASE,
    VARIANT[variant],
    SIZE[size],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
    leftIcon,
    className,
  } = props;
  const cls = classes(variant, size, fullWidth, className);

  if (props.href !== undefined) {
    const {
      href,
      prefetch,
      // strip the styling-only props so they don't hit the DOM
      variant: _v,
      size: _s,
      fullWidth: _f,
      leftIcon: _l,
      className: _c,
      children,
      ...anchorRest
    } = props;
    return (
      <Link href={href} prefetch={prefetch} className={cls} {...anchorRest}>
        {leftIcon}
        {children}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    fullWidth: _f,
    leftIcon: _l,
    className: _c,
    children,
    ...buttonRest
  } = props;
  return (
    <button className={cls} {...buttonRest}>
      {leftIcon}
      {children}
    </button>
  );
}
