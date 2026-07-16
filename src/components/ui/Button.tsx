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
 *   primary-raised
 *               → Same accent fill and white label as primary, plus the white
 *                 outline and depth the More-sheet send tiles use: a resting
 *                 shadow, a hover lift, and a press that sinks and darkens.
 *                 For a page's top-level CTA, where primary's flat fill reads
 *                 as one more tile on a busy board.
 *   navigate    → NEUTRAL secondary (white fill + line-strong border + ink
 *                 text). Was blue-filled. Back / jump-to-page buttons.
 *   edit        → NEUTRAL secondary. Was amber-filled. "Edit this thing".
 *   utility     → NEUTRAL secondary. Was slate-filled. Document-add buttons
 *                 (+ Rate Con / + BOL / + POD).
 *   cancel      → NEUTRAL secondary. Modal Cancel / dismiss buttons.
 *   destructive → RED border, WHITE fill, RED text. Delete / Remove / Trash /
 *                 Cancel load — distinct from primary so a delete never reads
 *                 like a save.
 *   destructive-solid
 *               → SOLID red, white content. Same danger meaning as destructive,
 *                 for icon-only/compact controls where an outline reads as an
 *                 empty box.
 *
 * Only colors/radius/height change here; every variant name, prop, icon, and
 * the button-vs-Link behaviour are identical. This is a styling layer only —
 * behaviour/links/actions/form submission are unchanged.
 */

export type ButtonVariant =
  | "navigate"
  | "edit"
  | "primary"
  | "primary-raised"
  | "destructive"
  | "destructive-solid"
  | "cancel"
  | "utility";

export type ButtonSize = "sm" | "md";

// The transition lives on each variant, not here: primary-raised animates a
// transform + shadow and needs transition-all, and two transition-property
// utilities on one element resolve by stylesheet order, not class order.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-mono font-semibold uppercase leading-none tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

// The neutralized secondary look shared by navigate / edit / utility / cancel:
// white surface, strong hairline, ink text, inset hover. No saturated fill.
// The surface is a fixed white, not bg-card: text-ink is a fixed near-black, so
// pairing it with a token that flips dark under admin-dark left every secondary
// button at ~1.7:1 — unreadable, and worst on the always-dark graphite bars.
const SECONDARY =
  "transition-colors border border-line-strong bg-white text-ink hover:bg-inset disabled:hover:bg-white";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "transition-colors border border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover",
  // Lifted verbatim from the More-sheet send tiles so the two treatments stay
  // one look: only the fill/outline differ from primary, and the border stays
  // white on hover — swapping it for accent-hover would erase the outline that
  // makes the button read as raised on the dark admin theme. Disabled drops the
  // depth so a dimmed button doesn't still look pressable.
  "primary-raised":
    "transition-all duration-150 border border-white bg-accent text-white shadow-md " +
    "hover:bg-accent-hover hover:-translate-y-0.5 hover:shadow-lg " +
    "active:translate-y-0 active:scale-[0.97] active:brightness-90 active:shadow-sm " +
    "disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:bg-accent disabled:hover:shadow-none",
  navigate: SECONDARY,
  edit: SECONDARY,
  utility: SECONDARY,
  cancel: SECONDARY,
  // Fixed white/red rather than the theme's bg-card: a destructive button often
  // sits on the always-dark graphite bar, where bg-card resolves to the dark
  // surface under admin-dark and the red label all but disappears.
  destructive:
    "transition-colors border border-bad bg-white text-bad hover:bg-bad-bg disabled:hover:bg-white",
  "destructive-solid":
    "transition-colors border border-bad bg-bad text-white hover:bg-[#8f1c13] hover:border-[#8f1c13]",
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
