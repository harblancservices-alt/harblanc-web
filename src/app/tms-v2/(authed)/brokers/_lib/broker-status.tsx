/**
 * Broker status → tone. Brokers use their own status vocabulary
 * (active/inactive), not the load/trip/lead domains `lib/domain/status.ts`
 * already registers — rather than extending that shared registry mid-phase
 * (v2-architecture.md §10's domain engine is out of scope for this build),
 * this stays a small, colocated resolver scoped to the brokers screens.
 */
const TONE_CLASSES = {
  ok: "bg-ok-bg text-ok",
  neutral: "bg-elevated text-fg-muted",
} as const;

export function BrokerStatusPill({ status }: { status: string | null | undefined }) {
  // Defensive: `brokers.status` has no DB-level NOT NULL/default, so a
  // broker created before that was ever enforced at the app layer (e.g.
  // implicitly via the Load form, or the Farm-a-contact flow) can genuinely
  // have a null status — a bare `status.charAt(0)` on that crashed the
  // Server Component render for exactly those brokers (audit: the "some
  // brokers throw, not all" bug report). Treat missing status as "active",
  // matching updateBroker's own `?? "active"` save-time fallback.
  const resolved = status && status.trim() ? status : "active";
  const tone = resolved === "active" ? "ok" : "neutral";
  const label = resolved.charAt(0).toUpperCase() + resolved.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
