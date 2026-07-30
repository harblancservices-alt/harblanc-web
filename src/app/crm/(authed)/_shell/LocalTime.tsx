"use client";

import { parseServerTimestamp } from "./format";

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Renders a stored Postgres timestamptz string in the VIEWER's local
 * timezone. formatDateTime (format.ts) is called from Server Components,
 * where toLocaleString resolves against the SERVER's zone — fine for
 * display-only dates elsewhere, but wrong for a per-user activity log where
 * an evening event can land on the wrong calendar day for the viewer. This
 * must run client-side so Date/Intl resolve against the browser's actual
 * timezone instead. Always goes through parseServerTimestamp first, since
 * Postgres timestamptz strings ("2026-07-28 02:00:31.26295+00") aren't
 * valid ISO 8601 and `new Date(...)` alone parses them inconsistently.
 */
export function LocalTime({
  iso,
  options = DEFAULT_OPTIONS,
  fallback = "—",
}: {
  iso: string | null | undefined;
  options?: Intl.DateTimeFormatOptions;
  fallback?: string;
}) {
  const d = parseServerTimestamp(iso);
  if (!d) return <>{fallback}</>;
  return <>{d.toLocaleString("en-US", options)}</>;
}
