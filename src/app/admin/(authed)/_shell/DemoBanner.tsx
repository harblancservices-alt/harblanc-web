import Link from "next/link";

/**
 * DEMO MODE banner — shown at the top of every admin page while demo mode is
 * on (the authed layout renders it above the portal shell). Fixed amber colors
 * so it reads identically in light and dark; a standing, unmissable reminder
 * that the whole portal is showing curated sample data and that no real record
 * is being read or changed. Tapping it jumps to Settings, where it's toggled.
 */
export function DemoBanner() {
  return (
    <Link
      href="/admin/settings"
      prefetch={false}
      className="flex items-center justify-center gap-2 border-b border-amber-600 bg-amber-400 px-4 py-1.5 text-center text-black transition-colors hover:bg-amber-300"
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full bg-black/70"
      />
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">
        Demo mode — sample data · nothing is saved
      </span>
    </Link>
  );
}
