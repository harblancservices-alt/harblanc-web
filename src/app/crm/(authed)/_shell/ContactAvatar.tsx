/**
 * Generic "no photo" contact avatar — a soft light-grey circle with a
 * simple person-silhouette cutout (head + shoulders), the same shape every
 * social app's default avatar uses. Replaces the old black/colored square
 * with the contact's initial (2026-08-10, Brent's call — read as too harsh/
 * unreadable). Two plain circles (head, shoulders) clipped by the outer
 * circle's `overflow-hidden` — no SVG, no icon-font dependency, so it's
 * trivially reusable from both server and client components (no hooks,
 * nothing to hydrate). Size is entirely controlled by the caller's
 * `className` (e.g. "h-9 w-9", "h-11 w-11") to match whatever context it's
 * dropped into — the company profile's Contacts roster/detail panel
 * (ContactsMasterDetail.tsx) and the standalone contact profile's header
 * (ContactHeader.tsx) currently use three different sizes.
 */
export function ContactAvatar({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#e4e6eb] ${className}`} aria-hidden>
      <span className="absolute left-1/2 top-[20%] h-[38%] w-[38%] -translate-x-1/2 rounded-full bg-[#9aa1ab]" />
      <span className="absolute left-1/2 bottom-[-12%] h-[62%] w-[82%] -translate-x-1/2 rounded-full bg-[#9aa1ab]" />
    </span>
  );
}
