"use client";

import { Button } from "@/components/tms-v2/ui/Button";

/**
 * Root error boundary for /tms-v2 — rendered inside PortalShell (the
 * (authed)/layout.tsx segment above this stays mounted, per Next.js error
 * boundary semantics), so the shell chrome stays visible even when a page
 * throws. Page-specific error.tsx files are added later only where a
 * page's failure mode is meaningfully different from "show a retry button"
 * (v2-architecture.md §5).
 */
export default function TmsV2Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <h1 className="text-[20px] font-semibold text-fg">Something went wrong</h1>
      <p className="text-[13px] text-fg-muted">{error.message || "An unexpected error occurred."}</p>
      <Button variant="secondary" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
