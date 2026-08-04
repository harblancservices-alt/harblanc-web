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

export function BrokerStatusPill({ status }: { status: string }) {
  const tone = status === "active" ? "ok" : "neutral";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
