import { Card } from "@/components/tms-v2/ui/Card";
import type { Takeaway } from "@/lib/dispatch/performance";
import { dotClass } from "./InsightsStrip";

/**
 * Desktop-only insights layout — same `Takeaway[]` and tone-dot rendering
 * as InsightsStrip (imports its `dotClass` rather than duplicating it), but
 * wrapped in a responsive grid instead of a single divided column so the
 * full-width bottom row uses the space it has. InsightsStrip itself is
 * untouched for mobile.
 */
export function InsightsGrid({ items }: { items: Takeaway[] }) {
  return (
    <Card>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Insights</p>
      <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2.5 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 py-1">
            <span className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(item.tone)}`} aria-hidden="true" />
            <p className="text-[13px] leading-[1.45] text-fg-muted">
              {item.segs.map((s, i) =>
                s.bold ? (
                  <strong key={i} className="font-semibold tabular-nums text-fg">
                    {s.text}
                  </strong>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
