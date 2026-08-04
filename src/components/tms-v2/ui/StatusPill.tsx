import { resolveStatus, type StatusDomain, type StatusTone } from "@/lib/domain/status";

const TONE_CLASSES: Record<StatusTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  neutral: "bg-elevated text-fg-muted",
};

type StatusPillProps = {
  status: string;
  domain: StatusDomain;
  className?: string;
};

/** Resolves color/label from lib/domain/status.ts — never a per-page
 * string-to-color map (v2-architecture.md §2). */
export function StatusPill({ status, domain, className = "" }: StatusPillProps) {
  const { label, tone } = resolveStatus(domain, status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {label}
    </span>
  );
}
