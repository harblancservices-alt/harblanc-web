/**
 * A COMPANY's avatar — a small square carrying its first letter, distinct
 * from ContactAvatar's generic person-silhouette (Brent's 2026-08-10 call
 * retired initials specifically for PEOPLE; a company square reads
 * differently and stays useful for quickly telling rows apart in a dense
 * list like Next Best Action / Going Stale). Same visual language as the
 * sidebar's identity/brand-mark squares (bg-accent, bold letter) elsewhere
 * in the shell.
 */
export function CompanyAvatar({
  name,
  className = "h-9 w-9 text-[13px]",
}: {
  name: string;
  className?: string;
}) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg bg-accent font-black text-white ${className}`}
    >
      {letter}
    </span>
  );
}
