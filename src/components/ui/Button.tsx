import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Site-wide admin button — one component, six variants chosen BY FUNCTION so
 * buttons are coloured consistently across every admin page regardless of who
 * built the page.
 *
 *   navigate    → BLUE filled. Back buttons (← Loads) and jump-to-page buttons
 *                 (Trip, Broker, Open lead). Anything that goes to another page.
 *   edit        → AMBER/orange filled. Every "edit this thing" control.
 *   primary     → RED filled. The main do-it/commit actions (Save, Update,
 *                 Add load, New trip, Send, + Add expense, Build preview …).
 *   destructive → RED border, WHITE fill, BLACK text. Delete / Remove / Trash /
 *                 Cancel load — distinct from primary so a delete never reads
 *                 like a save.
 *   cancel      → NEUTRAL gray. Modal Cancel / dismiss buttons that just close.
 *   utility     → SLATE filled. The document-add buttons (+ Rate Con / + BOL /
 *                 + POD). A tasteful neutral that reads well on both the dark
 *                 dashboard active-load card and the light load-detail page,
 *                 and is clearly none of red / blue / orange.
 *
 * Renders a real <button> by default; pass `href` to render a Next <Link>
 * (for navigate buttons that are links) with the identical styling. All native
 * button/anchor props (type, formAction, onClick, disabled, target, aria-*…)
 * pass straight through, so behaviour/links/actions are unchanged — this is a
 * styling layer only.
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
  "inline-flex items-center justify-center gap-1.5 rounded-md font-mono font-bold uppercase leading-none tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

const VARIANT: Record<ButtonVariant, string> = {
  navigate: "border border-blue-700 bg-blue-600 text-white hover:bg-blue-700",
  edit: "border border-amber-700 bg-amber-600 text-white hover:bg-amber-700",
  primary: "border border-red-700 bg-red-600 text-white hover:bg-red-700",
  destructive:
    "border border-red-600 bg-white text-black hover:bg-red-50 disabled:hover:bg-white",
  cancel:
    "border border-line-strong bg-card text-fg hover:bg-elevated",
  utility:
    "border border-slate-500 bg-slate-600 text-white hover:bg-slate-700",
};

// Mobile-friendly tap targets: sm ≈ 30px tall, md ≈ 36px tall.
const SIZE: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-[11px]",
  md: "px-3.5 py-2 text-[12px]",
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
