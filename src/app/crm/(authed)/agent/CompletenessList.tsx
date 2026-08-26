import Link from "next/link";
import { titleCaseWords } from "../_shell/format";
import { GAP_REASON, type CompletenessGap } from "./completeness";

/**
 * Completeness gaps, rendered ALONGSIDE real tasks but visibly not one of
 * them.
 *
 * THE VISUAL DISTINCTION IS THE POINT (Brent, 2026-08-26). An agent has to be
 * able to tell "the system noticed this" from "Brent asked me for this",
 * because only one of those is worth pushing back on. So a gap row:
 *
 *   - has NO checkbox. There is nothing to complete — it disappears when the
 *     field is filled, which is a different mechanism and should look like
 *     one. A tick box would promise a completion that cannot happen.
 *   - is prefixed with a hollow square rather than the tasks' filled dot.
 *   - sits on the inset surface, not a white card.
 *   - says why, in muted text, so the ask never reads as arbitrary.
 *
 * Everything here is derived per render from the company record. Nothing is
 * stored, nothing is counted in the open/overdue numbers, and there is
 * nothing to reap when it is fixed.
 */
export function CompletenessList({
  gaps,
  total,
  /** Heading tone — the dashboard gives this its own card, the planning board
   * tucks it under the Inbox column. */
  compact = false,
}: {
  gaps: CompletenessGap[];
  /** Gaps across the whole book, which may exceed what is shown. */
  total: number;
  compact?: boolean;
}) {
  if (gaps.length === 0) return null;

  return (
    <div className={compact ? "" : "border-t border-line"}>
      <div className="flex flex-wrap items-baseline gap-2 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-fg-muted">
          Gaps in your records
        </span>
        {/* Says "5 of 23" rather than implying five is all there is. */}
        <span className="text-[11.5px] text-fg-subtle">
          {total > gaps.length ? `${gaps.length} of ${total}` : total}
        </span>
      </div>

      <ul className="space-y-1 px-2 pb-2">
        {gaps.map((gap) => (
          <li key={gap.id}>
            <Link
              href={gap.href}
              prefetch={false}
              className="flex items-start gap-2 rounded-[5px] border border-dashed border-line-strong bg-inset px-2.5 py-2 transition-colors hover:border-accent hover:bg-accent-bg"
            >
              {/* Hollow square, never a checkbox — see the component note. */}
              <span
                aria-hidden
                className="mt-[3px] h-[9px] w-[9px] shrink-0 rounded-[2px] border border-fg-subtle"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-bold text-fg">{gap.label}</span>
                <span className="block truncate text-[11.5px] text-fg-subtle">
                  {titleCaseWords(gap.companyName)} &middot; {GAP_REASON[gap.kind]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
