"use client";

import { parseServerTimestamp } from "./format";

const CENTRAL_TZ = "America/Chicago";

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Renders a stored Postgres timestamptz string in US Central time, labeled
 * "CST" — the CRM's one and only display timezone, regardless of the
 * viewer's own browser zone. Always goes through parseServerTimestamp first,
 * since Postgres timestamptz strings ("2026-07-28 02:00:31.26295+00") aren't
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
  return <>{d.toLocaleString("en-US", { ...options, timeZone: CENTRAL_TZ })} CST</>;
}
