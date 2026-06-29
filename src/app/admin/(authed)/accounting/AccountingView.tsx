import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/dispatch/payment";

/**
 * Accounting page — render layer.
 *
 * Summary strip, accounts receivable, payments ledger, and Stripe payouts.
 * Stripe-only sections show a soft "not connected" note when the live API
 * calls didn't return (e.g. secret key missing in this environment).
 */

export type AccountingData = {
  monthLabel: string;
  summary: {
    collectedMtd: number;
    feesMtd: number;
    netToBank: number;
    outstandingAr: number;
  };
  receivables: ReadonlyArray<{
    fqId: string;
    leadId: string | null;
    number: number | null;
    customerName: string;
    lane: string;
    total: number | null;
    paid: number;
    outstanding: number | null;
    status: "overdue" | "unpaid" | "deposit";
    daysOverdue: number | null;
  }>;
  ledger: ReadonlyArray<{
    id: string;
    date: string | null;
    customerName: string;
    amount: number;
    method: string;
    status: string;
    isStripe: boolean;
  }>;
  payouts: ReadonlyArray<{
    id: string;
    date: string;
    arrivalDate: string | null;
    amount: number;
    status: string;
  }>;
  balance: { available: number; pending: number } | null;
  stripeOk: boolean;
  stripeDashboardUrl: string;
};

export function AccountingView({ data }: { data: AccountingData }) {
  const { summary } = data;
  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="w-full px-4 py-5 sm:px-6 lg:px-10">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold leading-none tracking-tight text-fg">
            Accounting{" "}
            <span className="text-[13px] font-normal text-fg-subtle">
              · {data.monthLabel}
            </span>
          </h1>
          <Button
            variant="navigate"
            size="sm"
            href={data.stripeDashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Stripe
            <ExternalIcon />
          </Button>
        </header>

        <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label="Collected MTD" value={usd(summary.collectedMtd)} tone="green" />
          <Kpi
            label="Stripe fees"
            value={data.stripeOk ? usd(summary.feesMtd) : "—"}
            tone="amber"
          />
          <Kpi label="Net to bank" value={usd(summary.netToBank)} tone="green" />
          <Kpi
            label="Outstanding A/R"
            value={usd(summary.outstandingAr)}
            tone={summary.outstandingAr > 0 ? "red" : "muted"}
          />
        </div>

        <SectionLabel
          title="Accounts receivable"
          note={
            data.receivables.length === 0
              ? "all settled"
              : data.receivables.length + " open"
          }
        />
        {data.receivables.length === 0 ? (
          <EmptyCard text="Nothing outstanding — every sent quote is paid in full." />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
            {data.receivables.map((r) => (
              <ReceivableCard key={r.fqId} r={r} />
            ))}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <SectionLabel title="Payments ledger" note={String(data.ledger.length)} />
            {data.ledger.length === 0 ? (
              <EmptyCard text="No payments recorded yet." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
                <Row grid={LEDGER_GRID} head>
                  <span>Date</span>
                  <span>Customer</span>
                  <span className="text-right">Amount</span>
                  <span>Method</span>
                </Row>
                {data.ledger.map((p) => (
                  <Row key={p.id} grid={LEDGER_GRID}>
                    <span className="font-mono text-fg-subtle">
                      {shortDate(p.date)}
                    </span>
                    <span className="truncate font-medium text-fg">
                      {p.customerName}
                    </span>
                    <span className="text-right font-bold tabular-nums text-green-700">
                      {usd(p.amount)}
                    </span>
                    <span>
                      <StatusPill
                        label={methodLabel(p.method)}
                        tone={p.isStripe ? "blue" : "neutral"}
                      />
                    </span>
                  </Row>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel title="Payouts to bank" note="Stripe" />
            {!data.stripeOk ? (
              <EmptyCard text="Stripe not connected in this environment — payouts, fees, and balance will appear once the secret key is set." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
                {data.balance ? (
                  <div className="flex items-center justify-between gap-3 border-b border-line bg-elevated px-3.5 py-2 text-[12px]">
                    <span className="font-mono uppercase tracking-[0.08em] text-fg-muted">
                      Balance
                    </span>
                    <span className="tabular-nums">
                      <span className="font-bold text-green-700">
                        {usd(data.balance.available)}
                      </span>
                      <span className="text-fg-subtle"> available · </span>
                      <span className="text-fg-muted">
                        {usd(data.balance.pending)} pending
                      </span>
                    </span>
                  </div>
                ) : null}
                {data.payouts.length === 0 ? (
                  <div className="px-3.5 py-5 text-center font-mono text-[12px] text-fg-subtle">
                    No payouts yet.
                  </div>
                ) : (
                  <>
                    <Row grid={PAYOUT_GRID} head>
                      <span>Date</span>
                      <span>Status</span>
                      <span className="text-right">Amount</span>
                    </Row>
                    {data.payouts.map((p) => (
                      <Row key={p.id} grid={PAYOUT_GRID}>
                        <span className="font-mono text-fg-subtle">
                          {shortDate(p.date)}
                        </span>
                        <span>
                          <StatusPill
                            label={payoutLabel(p.status)}
                            tone={p.status === "paid" ? "green" : "amber"}
                          />
                        </span>
                        <span className="text-right font-bold tabular-nums text-green-700">
                          {usd(p.amount)}
                        </span>
                      </Row>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceivableCard({
  r,
}: {
  r: AccountingData["receivables"][number];
}) {
  const statusLabel =
    r.status === "overdue"
      ? `Overdue ${r.daysOverdue ?? 0}d`
      : r.status === "unpaid"
        ? "Unpaid"
        : "Deposit";
  const isDeposit = r.status === "deposit";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold text-fg">
            {r.customerName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
            <span className="font-mono text-blue-700">{r.lane}</span>
            {r.number != null ? (
              <span className="text-fg-subtle">· FQ #{r.number}</span>
            ) : null}
          </div>
        </div>
        <span
          className={
            "shrink-0 rounded-md px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-sm " +
            (isDeposit ? "bg-amber-500" : "bg-red-600")
          }
        >
          {statusLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <MoneyStat label="Total" value={usd(r.total ?? 0)} tone="muted" />
        <MoneyStat label="Paid" value={usd(r.paid)} tone="green" />
        <MoneyStat
          label="Outstanding"
          value={usd(r.outstanding ?? 0)}
          tone="red"
          big
        />
      </div>
    </>
  );

  const cls =
    "block rounded-xl border border-line-strong bg-card p-4 shadow-lg ring-1 ring-black/5 transition-all hover:-translate-y-0.5 hover:shadow-xl";

  return r.leadId ? (
    <Link href={"/admin/quotes/" + r.leadId} prefetch={false} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function MoneyStat({
  label,
  value,
  tone,
  big = false,
}: {
  label: string;
  value: string;
  tone: "muted" | "green" | "red";
  big?: boolean;
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : "text-fg";
  return (
    <div>
      <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </div>
      <div
        className={
          "mt-0.5 font-bold tabular-nums " +
          (big ? "text-[20px] " : "text-[15px] ") +
          color
        }
      >
        {value}
      </div>
    </div>
  );
}
const LEDGER_GRID = "60px minmax(0,1fr) 90px 96px";
const PAYOUT_GRID = "64px minmax(0,1fr) 100px";

type Tone = "green" | "amber" | "red" | "blue" | "neutral" | "muted";

const KPI_TONE: Record<"green" | "amber" | "red" | "muted", string> = {
  green: "text-green-700",
  amber: "text-amber-700",
  red: "text-red-700",
  muted: "text-fg-subtle",
};

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "muted";
}) {
  return (
    <div className="rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-sm">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-indigo-600">
        {label}
      </div>
      <div
        className={"mt-1 text-[22px] font-bold tabular-nums leading-none " + KPI_TONE[tone]}
      >
        {value}
      </div>
    </div>
  );
}

function Row({
  grid,
  head = false,
  children,
}: {
  grid: string;
  head?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        "grid items-center gap-2 px-3.5 py-2 " +
        (head
          ? "border-b border-line bg-elevated font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg-subtle"
          : "border-b border-line text-[13px] last:border-b-0")
      }
      style={{ gridTemplateColumns: grid }}
    >
      {children}
    </div>
  );
}

const PILL_TONE: Record<Tone, string> = {
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
  neutral: "bg-elevated text-fg-muted",
  muted: "bg-elevated text-fg-subtle",
};

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={
        "inline-block w-fit rounded-full px-2 py-[1px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] " +
        PILL_TONE[tone]
      }
    >
      {label}
    </span>
  );
}

function SectionLabel({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fg-muted">
        {title}
      </span>
      {note ? (
        <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
          · {note}
        </span>
      ) : null}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-4 py-5 text-center font-mono text-[12px] text-fg-subtle">
      {text}
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function methodLabel(method: string): string {
  if (method === "card") return "Card";
  if (method in PAYMENT_METHOD_LABELS) {
    return PAYMENT_METHOD_LABELS[method as PaymentMethod];
  }
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function payoutLabel(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "in_transit") return "In transit";
  if (status === "pending") return "Pending";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
