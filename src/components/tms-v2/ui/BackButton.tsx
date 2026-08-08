import Link from "next/link";

/**
 * The one shared "back to parent" control for /tms-v2 detail pages — a real
 * bordered button box (same secondary/sm look Button.tsx's `variant=
 * "secondary" size="sm"` renders), not a bare "← text" link. Every detail
 * page's back-to-list link should use this instead of its own ad hoc
 * `<Link>` so they read consistently sitewide.
 */
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg shadow-e1 transition-colors hover:bg-elevated"
    >
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}
