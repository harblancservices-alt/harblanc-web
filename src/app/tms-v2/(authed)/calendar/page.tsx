import Link from "next/link";
import { PageHeader } from "@/components/tms-v2/ui/PageHeader";
import { Money } from "@/components/tms-v2/ui/Money";
import { Button } from "@/components/tms-v2/ui/Button";
import { PageScroll } from "@/components/tms-v2/ui/PageScroll";
import { getAnalyticsLoads, type AnalyticsLoad } from "@/lib/data/analytics";
import { currentPeriod, periodRange, periodLabel, type Period } from "@/lib/domain/attribution";
import { centralDateKey } from "@/lib/domain/dates";
import { buildMonthGrid } from "./_lib/month-grid";
import { CalendarMonthGrid } from "./_components/CalendarMonthGrid";
import { CalendarAgenda } from "./_components/CalendarAgenda";

// Live, month-windowed query — never the whole `loads` table (v2-design.md
// §8's fixed weakness). Read fresh on every visit, matching Today.
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

type PageProps = { searchParams: Promise<{ month?: string }> };

export default async function CalendarPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const now = new Date();
  const period = parseMonthParam(sp.month) ?? currentPeriod(now);
  const todayKey = centralDateKey(now);

  const range = periodRange(period);
  const loads = await getAnalyticsLoads(range);

  const loadsByDay = new Map<string, AnalyticsLoad[]>();
  for (const l of loads) {
    if (!l.date) continue;
    const arr = loadsByDay.get(l.date);
    if (arr) arr.push(l);
    else loadsByDay.set(l.date, [l]);
  }

  const monthNet = loads.reduce((s, l) => s + l.net, 0);
  const weeks = buildMonthGrid(period, todayKey);

  const prevParam = monthParam(shiftPeriod(period, -1));
  const nextParam = monthParam(shiftPeriod(period, 1));
  const thisMonthParam = monthParam(currentPeriod(now));

  return (
    <PageScroll
      header={
        <>
          <PageHeader
            title="Calendar"
            description="Loads by pickup date — the same attribution rule Performance uses."
          />

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

            <div className="flex items-center gap-3">
              <form action="/tms-v2/calendar" method="GET" className="flex items-center gap-1.5">
                <input
                  type="month"
                  name="month"
                  defaultValue={monthParam(period)}
                  className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px] text-fg"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Jump
                </Button>
              </form>
              <div className="text-[13px] text-fg-muted">
                Month net: <Money value={monthNet} />
              </div>
            </div>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <CalendarMonthGrid weeks={weeks} loadsByDay={loadsByDay} />
        <CalendarAgenda weeks={weeks} loadsByDay={loadsByDay} />
      </div>
    </PageScroll>
  );
}
