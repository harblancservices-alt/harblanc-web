import Link from "next/link";
import { BrandLogo } from "@/components/site/BrandLogo";
import { IconSearch } from "./icons";

/**
 * Level 4 — portal top bar.
 *
 * Persistent across every authed route. Black bar, HARBLANC wordmark on
 * the left (clickable, links to /admin), visual-only search icon on the
 * right. Per Q9 the search icon does nothing — no tooltip, no disabled
 * state, no "coming soon." It exists until search is implemented.
 *
 * The wordmark uses BrandLogo with the inverted variant so it renders
 * correctly on the dark background. If assets.logoInverted is unset,
 * BrandLogo falls back to a typographic span that also reads white on
 * dark (see components/site/BrandLogo.tsx).
 *
 * Server component — no client state needed. The search "icon" is a
 * non-interactive span so the cursor stays default and accessibility
 * trees don't announce a fake button.
 */
export function PortalTopBar() {
  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-between gap-4 border-b border-black bg-black px-4 sm:flex sm:px-6">
      <Link
        href="/admin"
        prefetch={false}
        aria-label="HARBLANC dispatch portal"
        className="flex items-center"
      >
        <BrandLogo variant="inverted" className="h-6 w-auto sm:h-7" />
      </Link>
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center text-white"
      >
        <IconSearch className="h-5 w-5" />
      </span>
    </header>
  );
}
