"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

/**
 * The one button primitive for /tms-v2. Lives under components/tms-v2/ui
 * rather than the top-level components/ui, deliberately: components/ui
 * already holds /admin's own actively-shipping "V2 Fleet Ops" redesign
 * primitives (a same-named Button/Card/PageHeader with a different,
 * admin-specific visual language — uppercase mono labels, freight-paperwork
 * chrome — wired into 60+ admin pages as of this writing). Reusing or
 * overwriting those would either break /admin or import the wrong aesthetic
 * into /tms-v2, which v2-design.md's house rules explicitly reject (calm
 * Stripe/Linear/Ramp register, not industrial paperwork). This namespace
 * keeps /tms-v2's primitive set independent while still living in
 * src/components (not nested under app/tms-v2) so it stays reusable per
 * v2-architecture.md §4 if a future page elsewhere ever wants it.
 *
 * "use client" because callers pass onClick handlers from client contexts
 * (forms, inline-edit, modals) — a Server Component page can still render
 * this statically since Server Components may render Client Components
 * with serializable props.
 *
 * Variants map to the one-accent-color house rule (v2-design.md): "primary"
 * is the only surface allowed to use --accent as a fill — never repeated
 * for decoration elsewhere. "info" is a second, deliberately distinct fill —
 * the --info/--v2-blue token already exists in globals.css specifically for
 * this ("Action blue — the secondary/edit button fill: Edit / Trip / Broker
 * / Add files / TONU"), matching legacy /admin's own blue-button precedent
 * (components/ui/Button.tsx's `variant="blue"`) — not a dilution of the red
 * accent, a distinct semantic color for a distinct class of action.
 */
type Variant = "primary" | "secondary" | "ghost" | "destructive" | "info";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-white shadow-e1 hover:bg-accent-hover hover:shadow-e2",
  secondary: "bg-card text-fg border border-line-strong shadow-e1 hover:bg-elevated",
  ghost: "bg-transparent text-fg hover:bg-elevated",
  destructive: "bg-bad text-white shadow-e1 hover:opacity-90",
  info: "bg-info text-white shadow-e1 hover:bg-info-hover",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[15px]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
});
