import { formatCentral, formatCentralDate, formatCentralTime } from "@/lib/domain/dates";

type DateTimeCSTProps = {
  value: string | Date | null | undefined;
  /** "datetime" (default) -> "Aug 1, 2026, 2:41 PM CST"
   *  "date"               -> "Aug 1, 2026"
   *  "time"               -> "2:41 PM CST" */
  mode?: "datetime" | "date" | "time";
  className?: string;
};

/** The only sanctioned way to render a date/time in /tms-v2
 * (v2-design.md house rule #2). A raw Date/toLocaleString() call outside
 * this component is a review-blocking finding. */
export function DateTimeCST({ value, mode = "datetime", className = "" }: DateTimeCSTProps) {
  const text =
    mode === "date"
      ? formatCentralDate(value)
      : mode === "time"
        ? formatCentralTime(value)
        : formatCentral(value);
  return <span className={className}>{text}</span>;
}
