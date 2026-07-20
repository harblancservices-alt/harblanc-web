import Link from "next/link";
import { BrandLogo } from "@/components/site/BrandLogo";
import { SearchTrigger } from "./GlobalSearch";

/**
 * Level 4 — portal top bar.
 *
 * Persistent across every authed route. Black bar, HARBLANC wordmark on
 * the left (clickable, links to /admin), search on the right. The icon was
 * a visual-only placeholder "until search is implemented" — it is now the
 * real trigger, opening the global palette (loads / brokers / files) that
 * PortalShell mounts. ⌘K opens the same palette from anywhere.
 *
 * The wordmark uses BrandLogo with the inverted variant so it renders
 * correctly on the dark background. If assets.logoInverted is unset,
 * BrandLogo falls back to a typographic span that also reads white on
 * dark (see components/site/BrandLogo.tsx).
 *
 * Still a server component — SearchTrigger is a one-button client island,
 * so opening the palette doesn't pull the bar across the boundary.
 */
export function PortalTopBar() {
  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-4 sm:flex sm:px-6">
      <Link
        href="/admin"
        prefetch={false}
        aria-label="HARBLANC dispatch portal"
        className="flex items-center"
      >
        <BrandLogo variant="inverted" className="h-6 w-auto sm:h-7" />
      </Link>
      <SearchTrigger />
    </header>
  );
}
