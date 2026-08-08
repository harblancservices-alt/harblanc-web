import Link from "next/link";
import { Money } from "@/components/tms-v2/ui/Money";
import type { RecurringExpenseRow } from "@/lib/data/recurring-expenses";
import { toIsoDate } from "@/lib/data/recurring-expenses";

/**
 * Expenses' primary view (audit §I item 2 / Phase 3): "what's coming due,
 * and when" — chronological, grouped Overdue / Today / This week / Later
 * this month, built entirely from each row's already-computed
 * nextChargeDateIso (real recurrence data — respects start_date, end_date,
 * skip_next_date). Recurring bills only; one-time charges get their own
 * section (Phase 4) rather than commingling into this "next charge" list.
 */

type Bucket = "Overdue" | "Today" | "This week" | "Later this month";

const BUCKET_ORDER: Bucket[] = ["Overdue", "Today", "This week", "Later this month"];

function bucketFor(dateIso: string, todayIso: string, weekAheadIso: string, monthEndIso: string): Bucket | null {
  if (dateIso < todayIso) return "Overdue";
  if (dateIso === todayIso) return "Today";
  if (dateIso <= weekAheadIso) return "This week";
  if (dateIso <= monthEndIso) return "Later this month";
  return null;
}

export function UpcomingBills({ rows, closeHref }: { rows: RecurringExpenseRow[]; closeHref: (id: string) => string }) {
  const today = new Date();
  const todayIso = toIsoDate(today);
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekAheadIso = toIsoDate(weekAhead);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthEndIso = toIsoDate(monthEnd);

  const groups = new Map<Bucket, RecurringExpenseRow[]>();
  for (const r of rows) {
    if (r.archived || r.frequency === "onetime" || !r.nextChargeDateIso) continue;
    const bucket = bucketFor(r.nextChargeDateIso, todayIso, weekAheadIso, monthEndIso);
    if (!bucket) continue;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket)!.push(r);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.nextChargeDateIso ?? "").localeCompare(b.nextChargeDateIso ?? ""));

  const totalCount = [...groups.values()].reduce((s, l) => s + l.length, 0);

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border border-line bg-card p-4 text-[13px] text-fg-muted shadow-e1">
        No recurring bills due this month.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-card shadow-e1">
      <div className="border-b border-line px-4 py-3">
        <div className="text-[14px] font-semibold text-fg">Upcoming bills</div>
        <div className="text-[12px] text-fg-muted">What's coming due, nearest first</div>
      </div>
      <div className="divide-y divide-line">
        {BUCKET_ORDER.filter((b) => groups.has(b)).map((bucket) => (
          <div key={bucket} className="px-4 py-2.5">
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${bucket === "Overdue" ? "text-bad" : "text-fg-muted"}`}>
              {bucket} · {groups.get(bucket)!.length}
            </div>
            <div className="mt-1.5 flex flex-col divide-y divide-line/60">
              {groups.get(bucket)!.map((r) => (
                <Link
                  key={r.id}
                  href={closeHref(r.id)}
                  className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-2 text-[13px] hover:bg-elevated sm:grid-cols-[72px_1.4fr_1fr_1fr_auto_auto]"
                >
                  <span className="text-fg-muted">{r.nextChargeLabel}</span>
                  <span className="truncate font-medium text-fg">{r.name}</span>
                  <span className="hidden truncate text-fg-muted sm:block">{r.cardName ?? "—"}</span>
                  <span className="hidden truncate text-fg-muted sm:block">{r.category ?? "—"}</span>
                  <span className="hidden text-fg-muted sm:block">{r.autopay ? "Autopay" : "Manual"}</span>
                  <Money value={r.amount} tone="none" className="justify-self-end font-semibold" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
