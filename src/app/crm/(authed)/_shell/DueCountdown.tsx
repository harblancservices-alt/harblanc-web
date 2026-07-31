import { dueCountdown, formatDateTime, type DueTone } from "./format";

const TONE_CLASS: Record<Exclude<DueTone, "muted">, string> = {
  danger: "bg-bad-bg text-bad",
  warning: "bg-warn-bg text-warn",
  accent: "bg-accent/10 text-accent",
};

/**
 * The BIG bold "when" readout for a due_at / next_followup_at — a colored
 * pill (red overdue / amber today-or-tomorrow / blue further out) with the
 * exact date/time in small type underneath, so urgency reads at a glance
 * instead of blending into a faint gray date line. No date renders as small,
 * neutral text only — there's nothing urgent to call out.
 */
export function DueCountdown({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  const { text, tone } = dueCountdown(iso);

  if (tone === "muted") {
    return (
      <span className={`text-[12.5px] text-fg-subtle ${className ?? ""}`}>{text}</span>
    );
  }

  return (
    <div className={`flex flex-col items-start gap-0.5 ${className ?? ""}`}>
      <span
        className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[15px] font-bold leading-none ${TONE_CLASS[tone]}`}
      >
        {text}
      </span>
      <span className="text-[11px] text-fg-subtle">{formatDateTime(iso)}</span>
    </div>
  );
}
