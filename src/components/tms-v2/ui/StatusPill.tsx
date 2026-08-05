import { resolveStatus, type StatusDomain, type StatusTone } from "@/lib/domain/status";

/** Semantic color map (v2-design.md's depth pass): green=revenue/completed,
 * blue=active/dispatch/in-progress, orange=pending/needs-attention,
 * red=overdue/critical, gray=supporting/no-urgency. "info" uses the same
 * steel-blue chip pair /admin already reserves for status hues (never the
 * --info button-fill blue, which is a different affordance). */
const TONE_CLASSES: Record<StatusTone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-steel-bg text-steel",
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
