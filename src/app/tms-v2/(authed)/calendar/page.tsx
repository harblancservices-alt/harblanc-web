import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Button } from "@/components/tms-v2/ui/Button";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { listLoads } from "@/lib/data/loads";
import { currentPeriod, periodLabel, type Period } from "@/lib/domain/attribution";
import { centralDateKey } from "@/lib/domain/dates";
import { addDays, dateOnly, assignLanes, monthMatrix, parseDateStr, weekdayOf } from "@/lib/dispatch/calendar";
import { formatMoney } from "@/lib/domain/money";
import { CalendarMonthGrid, type LoadBar, type WeekNet } from "./_components/CalendarMonthGrid";

// Live, unbounded read of every load (mirrors legacy /admin's own Calendar
// query exactly — see resolveSpan()'s header below for why a period filter
// doesn't work here) — read fresh on every visit, matching Today.
export const dynamic = "force-dynamic";

function parseMonthParam(month: string | undefined): Period | null {
  if (!month) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return null;
  return { year: Number(m[1]), month: monthIdx };
}

function shiftPeriod(period: Period, delta: number): Period {
  const ord = period.year * 12 + period.month + delta;
  const year = Math.floor(ord / 12);
  const month = ((ord % 12) + 12) % 12;
  return { year, month };
}

function monthParam(period: Period): string {
  return `${period.year}-${String(period.month + 1).padStart(2, "0")}`;
}

const NAV_BUTTON = "inline-flex h-8 items-center justify-center rounded-md border border-line-strong px-3 text-[13px] text-fg hover:bg-elevated";

/**
 * Resolve a load's calendar bar span — ported verbatim from legacy /admin's
 * Calendar (src/app/admin/(authed)/calendar/page.tsx's own resolveSpan()),
 * field names adapted to LoadWithFinancials' camelCase. Primary = pickup ->
 * delivery; an older/incomplete load missing those falls back so it still
 * shows up SOMEWHERE — exactly attributionDate()'s own pickup ?? delivery ??
 * created_at chain (lib/domain/attribution.ts), just producing a {start,
 * end} SPAN instead of one bucketing date, since a Gantt bar needs both
 * ends. Returns null only in the true edge case where none of the three
 * fields exist at all (admin assumes created_at always does; this is
 * slightly more defensive for a nullable-typed field).
 */
function resolveSpan(l: { pickupDate: string | null; deliveryDate: string | null; createdAt: string | null }): { start: string; end: string; approx: boolean } | null {
  const pickup = dateOnly(l.pickupDate);
  const delivery = dateOnly(l.deliveryDate);
  if (pickup && delivery) return { start: pickup, end: delivery < pickup ? pickup : delivery, approx: false };
  if (pickup) return { start: pickup, end: pickup, approx: false };
  if (delivery) return { start: delivery, end: delivery, approx: false };
  const created = dateOnly(l.createdAt) ?? (l.createdAt ? l.createdAt.slice(0, 10) : null);
  return created ? { start: created, end: created, approx: true } : null;
}

type SearchParams = { month?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const now = new Date();
  const period = parseMonthParam(sp.month) ?? currentPeriod(now);
  const todayKey = centralDateKey(now);

  // Every load, unbounded by period — a Gantt bar can span into an adjacent
  // month's grid padding, so (like admin) the whole set is fetched once and
  // clipped to the viewed grid below, not queried per-period. `financials`
  // is already the canonical computeLoadNet() figure (lib/domain/money.ts)
  // via listLoads() — no second money calculation here, only date-span math.
  const { rows: allLoads } = await listLoads({ pageSize: 3000 });

  const loadBars: LoadBar[] = [];
  for (const l of allLoads) {
    const span = resolveSpan({ pickupDate: l.pickupDate, deliveryDate: l.deliveryDate, createdAt: l.createdAt });
    if (!span) continue;
    loadBars.push({
      id: l.id,
      label: `${l.origin?.trim() || "—"} → ${l.destination?.trim() || "—"}`,
      start: span.start,
      end: span.end,
      approx: span.approx,
      cancelled: l.status === "tonu",
      net: l.financials.isTonu ? 0 : l.financials.net,
    });
  }

  const weeks = monthMatrix(period.year, period.month);
  const gridStart = weeks[0][0];
  const gridEnd = weeks[weeks.length - 1][6];
  const visibleLoads = loadBars.filter((l) => l.end >= gridStart && l.start <= gridEnd);
  const lanes = assignLanes(visibleLoads);

  // Weekly net, keyed by each week's Sunday: sum of canonical net for loads
  // that PICKED UP (bar start) in that Sun-Sat week, excluding TONU'd loads
  // and pickups outside the viewed month — same rule admin's CalendarView
  // uses, so a Jul 26-Aug 1 row viewed in August clips down to just the
  // Aug 1 pickups.
  const weekNets = new Map<string, WeekNet>();
  for (const l of visibleLoads) {
    if (l.cancelled) continue;
    const p = parseDateStr(l.start);
    if (!p || p.y !== period.year || p.m1 - 1 !== period.month) continue;
    const sunday = addDays(l.start, -weekdayOf(l.start));
    const cur = weekNets.get(sunday) ?? { net: 0, count: 0 };
    cur.net += l.net;
    cur.count += 1;
    weekNets.set(sunday, cur);
  }
  function weekNetValueOf(sunday: string): number {
    const w = weekNets.get(sunday);
    return w && w.count > 0 ? w.net : 0;
  }
  let monthMaxProfit = 0;
  for (const week of weeks) monthMaxProfit = Math.max(monthMaxProfit, weekNetValueOf(week[0]));
  let monthTotal = 0;
  for (const week of weeks) monthTotal += weekNetValueOf(week[0]);

  const prevParam = monthParam(shiftPeriod(period, -1));
  const nextParam = monthParam(shiftPeriod(period, 1));
  const thisMonthParam = monthParam(currentPeriod(now));

  return (
    <PageScroll
      header={
        <>
          <PageHeader title="Calendar" description="An activity logbook — green bars span each load's pickup through delivery." />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-2">
              <Link href={`/tms-v2/calendar?month=${prevParam}`} className={NAV_BUTTON} aria-label="Previous month">
                ‹
              </Link>
              <Link href={`/tms-v2/calendar?month=${thisMonthParam}`} className={NAV_BUTTON}>
                Today
              </Link>
              <Link href={`/tms-v2/calendar?month=${nextParam}`} className={NAV_BUTTON} aria-label="Next month">
                ›
              </Link>
              <h2 className="pl-2 text-[17px] font-semibold text-fg">{periodLabel(period)}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-fg-muted">
                <span className="h-3 w-4 rounded-sm bg-green-700" />
                Loaded
              </span>
              <form action="/tms-v2/calendar" method="GET" className="flex items-center gap-1.5">
                <input type="month" name="month" defaultValue={monthParam(period)} className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg" />
                <Button type="submit" variant="secondary" size="sm">
                  Jump
                </Button>
              </form>
              <div className="text-[13px] text-fg-muted">Month total: {formatMoney(monthTotal)}</div>
            </div>
          </div>
        </>
      }
    >
      <CalendarMonthGrid
        weeks={weeks}
        month0={period.month}
        today={todayKey}
        loads={visibleLoads}
        lanes={lanes}
        weekNets={weekNets}
        monthMaxProfit={monthMaxProfit}
        monthTotal={monthTotal}
        monthLabel={periodLabel(period)}
      />
    </PageScroll>
  );
}
