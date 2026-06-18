/**
 * Instant navigation feedback for the admin portal.
 *
 * Next.js shows this skeleton the moment a link is tapped, while the
 * destination page's server component fetches its data. Without it the
 * old page stays frozen on screen until everything is ready, which reads
 * as "the app is slow." A lightweight, theme-aware placeholder makes taps
 * feel immediate. Applies to every authed route that lacks its own
 * loading.tsx.
 */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="min-h-screen bg-canvas px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="animate-pulse space-y-4">
        {/* Title bar */}
        <div className="h-6 w-44 rounded bg-elevated" />

        {/* KPI / summary tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-md border border-line bg-card"
            />
          ))}
        </div>

        {/* List rows */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-md border border-line bg-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
