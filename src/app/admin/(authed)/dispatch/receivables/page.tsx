import type { Metadata } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
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
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function loadReceivables() {
  const sb = createServiceRoleClient();

  // Outstanding = delivered, not paid, not soft-deleted. Oldest delivery first
  // so the longest-owed money is at the top.
  const { data: outstandingData } = await sb
    .from("loads")
    .select(
      "id, load_number, broker_name, origin, destination, delivery_date, rate, paid_at",
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
      "id, load_number, broker_name, origin, destination, delivery_date, rate, paid_at",
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

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-600">
              Dispatch
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-none tracking-tight text-fg">
              Accounts receivable
            </h1>
          </div>
          <Button href="/admin/dispatch/loads" variant="navigate" size="sm">
            ← Load board
          </Button>
        </header>

        {/* Running total — the all-time outstanding A/R. */}
        <section className="mb-4 rounded-md border border-line bg-card px-4 py-3.5 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-600">
              Outstanding · all time
            </span>
            <span className="font-mono text-[12px] tabular-nums text-fg-subtle">
              {outstanding.length} load{outstanding.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1 text-[28px] font-bold tabular-nums leading-none text-red-700">
            {usd(arTotal)}
          </div>
        </section>

        {/* Outstanding list — oldest delivery first. */}
        {outstanding.length === 0 ? (
          <div className="rounded-md border border-line bg-card px-3 py-10 text-center font-mono text-[13px] text-fg-subtle">
            All caught up — nothing outstanding. 🎉
          </div>
        ) : (
          <div className="space-y-2">
            {outstanding.map((l) => (
              <div
                key={l.id}
                className="flex items-stretch overflow-hidden rounded-md border border-line bg-card shadow-sm"
              >
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold text-fg">
                      {l.broker_name?.trim() || "—"}
                    </span>
                    <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-red-700">
                      {usd(num(l.rate))}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12.5px] text-fg-muted">
                    {l.origin?.trim() || "—"}{" "}
                    <span className="text-fg-subtle">→</span>{" "}
                    {l.destination?.trim() || "—"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg-subtle">
                    <span>#{l.load_number?.trim() || "—"}</span>
                    <span>Delivered {fmtDate(l.delivery_date)}</span>
                  </div>
                  <form action={markLoadPaid.bind(null, l.id)} className="mt-2.5">
                    <Button type="submit" variant="primary" size="sm">
                      Mark paid
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recently paid — undo an accidental mark-paid. */}
        {recentlyPaid.length > 0 ? (
          <section className="mt-6">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
              Recently paid
            </p>
            <div className="space-y-1.5">
              {recentlyPaid.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-elevated px-3 py-2"
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
