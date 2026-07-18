import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { markLoadPaid, markLoadUnpaid } from "../loads/actions";

export const metadata: Metadata = {
  title: "Accounts Receivable",
  robots: { index: false, follow: false },
};

/**
 * Dispatch → Accounts Receivable.
 *
 * Every delivered-but-unpaid load, across ALL months, is money still owed by a
 * broker. This page is the single all-time A/R tally (the load board's "A/R"
 * KPI links here): outstanding loads oldest-first with a running total, a
 * "Mark paid" action per row that drops it off the list, and a small
 * "recently paid" strip so an accidental mark-paid can be undone.
 *
 * A/R = sum of RATE over delivered loads whose payment_status is not "paid".
 * payment_status only ever holds "unpaid" (default) or "paid" — there is no
 * "factored" state — so every delivered-unpaid load counts as receivable.
 */

type ReceivableRow = {
  id: string;
  load_number: string | null;
  broker_id: string | null;
  broker_name: string | null;
  origin: string | null;
  destination: string | null;
  delivery_date: string | null;
  rate: number | string | null;
  paid_at: string | null;
};

function num(v: number | string | null): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // Date-only columns are parsed at UTC midnight to avoid a TZ off-by-one.
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  // M/D/YYYY — clean and legible, e.g. "3/5/2026".
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Whole days a load has been outstanding — from its DELIVERY date (when it
 * became receivable) to today. Both anchored to UTC midnight so it counts
 * calendar days, not partial-day fractions. Returns null when there's no
 * delivery date or it parses to a future/invalid value.
 */
function daysOutstanding(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const delivered = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );
  const days = Math.floor((today - delivered) / 86_400_000);
  return days >= 0 ? days : 0;
}

async function loadReceivables() {
  const sb = createServiceRoleClient();

  // Outstanding = delivered, not paid, not soft-deleted. Oldest delivery first
  // so the longest-owed money is at the top.
  const { data: outstandingData } = await sb
    .from("loads")
    .select(
      "id, load_number, broker_id, broker_name, origin, destination, delivery_date, rate, paid_at",
    )
    .eq("status", "delivered")
    .neq("payment_status", "paid")
    .is("deleted_at", null)
    .order("delivery_date", { ascending: true, nullsFirst: false })
    .returns<ReceivableRow[]>();

  // Recently paid — the undo affordance. Most-recently-paid first.
  const { data: paidData } = await sb
    .from("loads")
    .select(
      "id, load_number, broker_id, broker_name, origin, destination, delivery_date, rate, paid_at",
    )
    .eq("status", "delivered")
    .eq("payment_status", "paid")
    .not("paid_at", "is", null)
    .is("deleted_at", null)
    .order("paid_at", { ascending: false })
    .limit(6)
    .returns<ReceivableRow[]>();

  const outstanding = outstandingData ?? [];
  const arTotal = outstanding.reduce((s, l) => s + num(l.rate), 0);
  return { outstanding, recentlyPaid: paidData ?? [], arTotal };
}

export default async function ReceivablesPage() {
  const { outstanding, recentlyPaid, arTotal } = await loadReceivables();
  const now = new Date();

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Dispatch"
          title="Accounts receivable"
          className="mb-4"
          actions={
            <Button href="/admin/dispatch/loads" variant="navigate" size="sm">
              ← Load board
            </Button>
          }
        />

        {/* Running total — the all-time outstanding A/R. Same clean card the
            trip cards and the load board's KPI tiles carry (rounded-lg,
            border-line-strong, bg-card, e2); the number leads on size and
            weight alone, no black fill and no accent rail. */}
        <div className="mb-4 rounded-lg border border-line-strong bg-card px-4 py-3.5 shadow-e2">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
            Outstanding · all time
          </div>
          <div className="mt-1.5 text-[32px] font-bold leading-none tabular-nums text-ink">
            {usd(arTotal)}
          </div>
          <div className="mt-1.5 font-mono text-[12px] tabular-nums text-ink-2">
            {outstanding.length} load{outstanding.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Outstanding list — oldest delivery first. */}
        {outstanding.length === 0 ? (
          <div className="rounded-md border border-line bg-card px-3 py-10 text-center font-mono text-[13px] text-ink-3 shadow-e1">
            All caught up — nothing outstanding. 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {outstanding.map((l) => {
              const age = daysOutstanding(l.delivery_date, now);
              // Understated aging — subtle by default, a gentle amber/red once
              // it's been sitting a while. Age is what Brent wants to see.
              const ageColor =
                age == null
                  ? "text-fg-subtle"
                  : age > 45
                    ? "text-bad"
                    : age > 30
                      ? "text-warn"
                      : "text-fg-subtle";
              return (
                <div
                  key={l.id}
                  className="relative flex items-stretch overflow-hidden rounded-md border border-line bg-card shadow-e1 transition-colors hover:bg-elevated"
                >
                  <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold text-fg">
                        {l.broker_name?.trim() || "—"}
                      </span>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[15px] font-bold tabular-nums text-bad">
                          {usd(num(l.rate))}
                        </div>
                        {age != null ? (
                          <div
                            className={
                              "mt-0.5 font-mono text-[10px] tabular-nums " + ageColor
                            }
                          >
                            {age} day{age === 1 ? "" : "s"}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[12.5px] text-fg-muted">
                      {l.origin?.trim() || "—"}{" "}
                      <span className="text-fg-subtle">→</span>{" "}
                      {l.destination?.trim() || "—"}
                    </div>
                    <div className="mt-1.5 text-[12.5px] text-fg-muted">
                      <span className="font-mono text-[11px] text-fg-subtle">
                        #{l.load_number?.trim() || "—"}
                      </span>
                      <span className="ml-2">
                        Delivered {fmtDate(l.delivery_date)}
                      </span>
                    </div>
                    {/* Sits ABOVE the stretched broker link (z-10) so
                        submitting never doubles as a navigation. */}
                    <form
                      action={markLoadPaid.bind(null, l.id)}
                      className="relative z-10 mt-2.5 w-fit"
                    >
                      <Button type="submit" variant="primary" size="sm">
                        Mark paid
                      </Button>
                    </form>
                  </div>

                  {/* Stretched link — the whole card body taps through to the
                      broker's profile. An overlay (rather than wrapping the
                      card in an <a>) keeps the "Mark paid" form out of the
                      anchor, which would be invalid markup and would swallow
                      the submit. Loads with no linked broker get no link. */}
                  {l.broker_id ? (
                    <Link
                      href={`/admin/dispatch/brokers/${l.broker_id}`}
                      prefetch={false}
                      aria-label={`Open ${l.broker_name?.trim() || "broker"} profile`}
                      className="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Recently paid — undo an accidental mark-paid. */}
        {recentlyPaid.length > 0 ? (
          <section className="mt-6">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
              Recently paid
            </p>
            <div className="space-y-1.5">
              {recentlyPaid.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-inset px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="truncate text-[12.5px] font-semibold text-fg">
                      {l.broker_name?.trim() || "—"}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-fg-subtle">
                      #{l.load_number?.trim() || "—"} · {usd(num(l.rate))}
                    </span>
                  </div>
                  <form action={markLoadUnpaid.bind(null, l.id)}>
                    <Button type="submit" variant="cancel" size="sm">
                      Undo
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
