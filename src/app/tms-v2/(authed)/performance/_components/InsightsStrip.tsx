import { Card } from "@/components/tms-v2/ui/Card";
import type { Takeaway, TakeawayTone } from "@/lib/dispatch/performance";

/**
 * Restores the Insights strip (Phase 10) — the module (takeaways()) was
 * already fully built and audited correct, just never imported anywhere
 * under tms-v2. This renders its output verbatim; no new arithmetic here,
 * only the tone dot + bold-segment rendering legacy's own Takeaways
 * component already proved out, ported to tms-v2's Card primitive.
 */

function dotClass(tone: TakeawayTone): string {
  switch (tone) {
    case "good":
      return "bg-ok";
    case "warn":
      return "bg-warn";
    case "bad":
      return "bg-bad";
    default:
      return "bg-fg-subtle";
  }
}

export function InsightsStrip({ items }: { items: Takeaway[] }) {
  return (
    <Card>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-fg-muted">Insights</p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
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
