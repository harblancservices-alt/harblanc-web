"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusTag } from "@/components/ui/StatusTag";
import { DeleteExpenseButton } from "./DeleteExpenseButton";
import { ExpenseAccountsDialog } from "./ExpenseAccountsDialog";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import {
  chargeScheduleLabel,
  FREQUENCY_LABEL,
  type ExpenseItem,
  type ExpensesData,
} from "./types";

/**
 * Expenses — restyled to match the Dispatch app's premium card system (the
 * same rounded-2xl / shadow-e2 / bg-card language as the Load board's
 * LoadCard, the trips list's TripCard, and Receivables' InvoiceCard) so this
 * page reads as native Dispatch chrome rather than a bolted-on form screen.
 *
 * THEME SAFETY, same rule the other premium cards follow: card is a THEMED
 * surface, so only text-fg/-muted/-subtle sit on it directly. Anything that
 * needs a fixed tint (the schedule/category/card pills) lives on a FIXED
 * surface (bg-inset, bg-steel-bg, …) with matching FIXED text (text-ink*,
 * text-steel, …) — see ReceivablesView's header comment for the long form.
 */

export function ExpensesView({ data }: { data: ExpensesData }) {
  const [dialog, setDialog] = useState<"new" | ExpenseItem | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <div className="min-h-screen border-t border-line bg-canvas text-fg">
      <div className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <PageHeader
          eyebrow="Payments"
          title="Expenses"
          className="mb-4"
          actions={
            <>
              <Button type="button" onClick={() => setCardsOpen(true)} variant="navigate">
                Manage cards
              </Button>
              <Button type="button" onClick={() => setDialog("new")} variant="primary">
                + Add expense
              </Button>
            </>
          }
        />

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-e1">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
          <p className="text-[12px] leading-snug text-fg-muted">
            Manual tracker only — nothing here is linked to a bank or card and
            no money moves. It&rsquo;s a hand-kept log of what charges each month.
          </p>
        </div>

        {/* ── Summary hero — same Stripe/Mercury two-up panel Receivables uses
            for its Outstanding Balance, just with Monthly / Annualized instead
            of Outstanding / Aging. ── */}
        <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-e2">
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                Monthly Recurring
              </div>
              <div className="mt-2 text-[36px] font-bold leading-none tracking-[-0.02em] tabular-nums text-fg sm:text-[42px]">
                {usd(data.monthlyTotal)}
              </div>
              <div className="mt-2.5 text-[13px] tabular-nums text-fg-muted">
                {data.expenses.length} recurring charge
                {data.expenses.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="min-w-0 sm:border-l sm:border-line sm:pl-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                Annualized
              </div>
              <div className="mt-2 text-[36px] font-bold leading-none tracking-[-0.02em] tabular-nums text-fg-muted sm:text-[42px]">
                {usd(data.annualTotal)}
              </div>
              <div className="mt-2.5 text-[13px] text-fg-muted">Monthly total × 12</div>
            </div>
          </div>
        </section>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <BreakdownCard title="By Category" items={data.byCategory} />
          <BreakdownCard title="By Card" items={data.byCard} />
        </div>

        {/* ── Expense cards ── */}
        <div className="mt-6">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              Recurring Charges
            </span>
            <span className="text-[11px] tabular-nums text-fg-subtle">
              · {data.expenses.length}
            </span>
          </div>

          {data.expenses.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {data.expenses.map((e) => (
                <ExpenseCard key={e.id} expense={e} onEdit={() => setDialog(e)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {dialog ? (
        <ExpenseFormDialog
          expense={dialog === "new" ? null : dialog}
          accounts={data.accounts}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}

      {cardsOpen ? (
        <ExpenseAccountsDialog accounts={data.accounts} onClose={() => setCardsOpen(false)} />
      ) : null}
    </div>
  );
}

/* ── Expense card ────────────────────────────────────────────────────────
 * Same anatomy as LoadCard/InvoiceCard: identity leads (name, bold), the
 * headline figure sits shrink-wrapped on the right, a pills row carries the
 * "what's next" schedule signal (emphasized, steel) plus category/card meta
 * (neutral), then an Edit/Delete action row under a hairline. No stretched
 * navigation link — unlike a load or an invoice, an expense doesn't drill
 * into a detail page, so Edit/Delete are the whole action surface. */
function ExpenseCard({
  expense: e,
  onEdit,
}: {
  expense: ExpenseItem;
  onEdit: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-e2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-e3">
      <div className="p-4 sm:p-5">
        {/* Identity + headline amount */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-bold leading-tight tracking-[-0.01em] text-fg sm:text-[20px]">
              {e.name}
            </h3>
            {e.vendor ? (
              <p className="mt-1 truncate text-[12.5px] text-fg-muted">{e.vendor}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[22px] font-bold leading-none tabular-nums text-fg sm:text-[26px]">
              {usdCents(e.amount)}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
              {FREQUENCY_LABEL[e.frequency]}
            </div>
          </div>
        </div>

        {/* Pills — schedule leads (the "what's next" signal), then meta */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <Pill tone="steel" icon={<CalendarIcon className="h-3 w-3" />}>
            {chargeScheduleLabel(e)}
            {e.nextChargeLabel ? (
              <span className="opacity-70"> · Next {e.nextChargeLabel}</span>
            ) : null}
          </Pill>
          {e.category ? <Pill tone="neutral">{e.category}</Pill> : null}
          {e.card ? (
            <Pill tone="neutral" icon={<CardIcon className="h-3 w-3" />}>
              {e.card}
            </Pill>
          ) : null}
          <StatusTag tone={e.autopay ? "green" : "amber"} hideDot>
            {e.autopay ? "Autopay" : "Manual"}
          </StatusTag>
        </div>

        {e.notes ? (
          <p className="mt-2.5 truncate text-[12px] text-fg-subtle">{e.notes}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Button type="button" onClick={onEdit} variant="edit" size="md" fullWidth>
          Edit
        </Button>
        <DeleteExpenseButton id={e.id} name={e.name} size="md" fullWidth />
      </div>
    </article>
  );
}

/** One metadata chip. `steel` for the identifying/emphasized signal (the
 *  schedule), `neutral` for plain meta (category, card) — the same two
 *  tones LoadCard's Pill and InvoiceCard's identity pills use. */
function Pill({
  tone,
  icon,
  children,
}: {
  tone: "steel" | "neutral";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-bold tabular-nums leading-none " +
        (tone === "steel"
          ? "bg-steel-bg text-steel"
          : "bg-inset font-semibold text-ink-2")
      }
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** One tile of a category/card breakdown — the same bg-inset tile Receivables
 *  uses for its aging-bucket summary, inside a card matching KpiGrid's tiles. */
function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ label: string; total: number }>;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-e2 sm:p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-3 text-[12.5px] text-fg-muted">Nothing yet.</div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {items.slice(0, 5).map((it) => (
            <div
              key={it.label}
              className="flex items-center justify-between gap-2 rounded-xl bg-inset px-3 py-2 shadow-e1"
            >
              <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink-2">
                {it.label}
              </span>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink">
                {usd(it.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-card px-6 py-12 text-center shadow-e1">
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-steel-bg text-steel">
        <CalendarIcon className="h-5 w-5" />
      </span>
      <div className="mt-3.5 text-[15px] font-semibold text-fg">
        No recurring expenses logged yet
      </div>
      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-fg-muted">
        Add the truck payment, insurance, subscriptions — whatever charges on
        a schedule — to start tracking them here.
      </p>
    </div>
  );
}

/* ── Icons — small local line glyphs, same 24-viewBox/round-cap stroke style
   the rest of the admin's page-local icon sets use (LoadCard, ReceivablesView). */

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8v.01" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" />
    </svg>
  );
}

/* ── Money formatting ────────────────────────────────────────────────────── */

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function usdCents(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
