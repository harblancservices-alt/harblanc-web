"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { markLoadPaid, markLoadUnpaid } from "../loads/actions";
import type { ReceivableItem, PaidItem } from "@/lib/dispatch/view-types";

/**
 * Accounts Receivable — the presentation layer.
 *
 * The server page does every read and every derivation (dollar totals, days
 * outstanding, the preformatted dates); this file only lays them out, and owns
 * the three things that are genuinely client-side: the sort/filter of the
 * visible list, the CSV export of it, and the Mark-as-paid pending state.
 *
 * THEME SAFETY. The admin ships a light theme and a dark theme over the same
 * utility classes, so only two kinds of surface are safe to put colored text
 * on:
 *
 *   - Themed surfaces (bg-card / bg-canvas) carry themed text ONLY —
 *     text-fg / text-fg-muted / text-fg-subtle, which flip with the theme.
 *   - Fixed surfaces (bg-inset, bg-ok-bg, bg-graphite … all defined once at
 *     :root and never overridden by .admin-dark) carry FIXED text — text-ink,
 *     text-ok, text-bad, text-white.
 *
 * That is why every dollar figure that has to read red or green lives on a
 * bg-inset panel or inside a tinted pill rather than floating on the card: a
 * #b42318 numeral straight on the dark card is ~2:1 and unreadable. The design
 * intent's palette (red #D32F2F, navy #0F172A, success #22C55E …) maps onto the
 * V2 tokens that already encode it — accent/bad for red, graphite for navy,
 * ok/warn for green/orange.
 */


/* ── Aging bands ──────────────────────────────────────────────────────────
   Four buckets, per the A/R convention: 0–30 is money in flight, 31–60 needs a
   nudge, 61–90 is late, 90+ is at-risk. Undated loads can't be aged at all, so
   they get their own neutral band and sit out of the aging columns rather than
   being silently counted as current.

   Every band's colors are FIXED (light tint + dark text, or a solid dark-red
   fill + white) so the badge reads identically on both admin themes. */
type BandKey = "b0" | "b1" | "b2" | "b3" | "none";

const BAND_ORDER: readonly BandKey[] = ["b0", "b1", "b2", "b3"];

const BANDS: Record<
  BandKey,
  {
    /** Uppercase pill on the card. */
    badge: string;
    /** Column heading in the aging summary. */
    column: string;
    /** Short label for the filter chips. */
    chip: string;
    /** Pill classes — fixed fill + fixed text. */
    pill: string;
    /** Value color for the aging column, on the fixed bg-inset tile. */
    value: string;
  }
> = {
  b0: {
    badge: "Current",
    column: "0–30 Days",
    chip: "0–30",
    pill: "bg-ok-bg text-ok",
    value: "text-ok",
  },
  b1: {
    badge: "31–60 Days",
    column: "31–60 Days",
    chip: "31–60",
    pill: "bg-warn-bg text-warn",
    value: "text-warn",
  },
  b2: {
    badge: "61–90 Days",
    column: "61–90 Days",
    chip: "61–90",
    pill: "bg-bad-bg text-bad",
    value: "text-bad",
  },
  b3: {
    badge: "90+ Days",
    column: "90+ Days",
    chip: "90+",
    // The one solid fill in the set — 90+ has to out-weigh the 61–90 tint, and
    // a deeper red tint would be indistinguishable from it. #8f1c13 is the
    // same deep red the destructive button presses to.
    pill: "bg-[#8f1c13] text-white",
    value: "text-[#8f1c13]",
  },
  none: {
    badge: "No date",
    column: "No date",
    chip: "No date",
    pill: "bg-slate-bg text-slate",
    value: "text-slate",
  },
};

function bandOf(days: number | null): BandKey {
  if (days == null) return "none";
  if (days <= 30) return "b0";
  if (days <= 60) return "b1";
  if (days <= 90) return "b2";
  return "b3";
}

/* ── Formatting ──────────────────────────────────────────────────────────── */

function usd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

/** Broker initials for the avatar — at most two letters, e.g. "TQL", "CH". */
function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* ── Line icons ───────────────────────────────────────────────────────────
   Inline 1.5px stroke glyphs on currentColor — they inherit whatever text
   color their button or label already resolved to, which keeps them theme-safe
   for free. No emoji anywhere on this screen. */

type IconProps = { className?: string };

function Icon({
  children,
  className = "h-4 w-4",
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

const DollarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M16 7.5C16 6 14.2 5 12 5S8 6 8 7.8s1.6 2.4 4 3 4 1.3 4 3.2S14.2 19 12 19s-4-1-4-2.5" />
  </Icon>
);

const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3h3.5l1.6 4-2.2 1.4a13 13 0 0 0 6.7 6.7L16 12.9l4 1.6V18a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.2 2 2 0 0 1 5 3Z" />
  </Icon>
);

const DocumentIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);

const ExportIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V3m0 0L8 7m4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icon>
);

const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
  </Icon>
);

const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 12.5 5.5 5.5L20 7" />
  </Icon>
);

const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12h15m0 0-5-5m5 5-5 5" />
  </Icon>
);

const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12H5m0 0 5-5m-5 5 5 5" />
  </Icon>
);

/* ── Sorting ─────────────────────────────────────────────────────────────── */

type SortKey = "oldest" | "newest" | "amount";

const SORT_LABEL: Record<SortKey, string> = {
  oldest: "Oldest first",
  newest: "Newest first",
  amount: "Amount (high → low)",
};

/* ── View ────────────────────────────────────────────────────────────────── */

export function ReceivablesView({
  outstanding,
  recentlyPaid,
  arTotal,
}: {
  outstanding: ReceivableItem[];
  recentlyPaid: PaidItem[];
  arTotal: number;
}) {
  const [sort, setSort] = useState<SortKey>("oldest");
  const [band, setBand] = useState<BandKey | "all">("all");
  const [filterOpen, setFilterOpen] = useState(false);

  /* The aging summary always describes the WHOLE book, not the filtered view —
     narrowing to "61–90" must not make the other three buckets read $0. */
  const buckets = useMemo(() => {
    const b: Record<BandKey, { total: number; count: number }> = {
      b0: { total: 0, count: 0 },
      b1: { total: 0, count: 0 },
      b2: { total: 0, count: 0 },
      b3: { total: 0, count: 0 },
      none: { total: 0, count: 0 },
    };
    for (const r of outstanding) {
      const k = bandOf(r.days);
      b[k].total += r.rate;
      b[k].count += 1;
    }
    return b;
  }, [outstanding]);

  const visible = useMemo(() => {
    const rows =
      band === "all" ? outstanding : outstanding.filter((r) => bandOf(r.days) === band);
    const sorted = [...rows];
    // Nulls sink in every ordering — an undated load has no age to rank.
    sorted.sort((a, b2) => {
      if (sort === "amount") return b2.rate - a.rate;
      const da = a.days ?? -1;
      const db = b2.days ?? -1;
      return sort === "oldest" ? db - da : da - db;
    });
    return sorted;
  }, [outstanding, band, sort]);

  function exportCsv() {
    const head = [
      "Broker",
      "Load #",
      "Origin",
      "Destination",
      "Delivered",
      "Days Out",
      "Aging",
      "Invoice Amount",
      "Balance Due",
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      head.map(esc).join(","),
      ...visible.map((r) =>
        [
          r.brokerName?.trim() || "",
          r.loadNumber?.trim() || "",
          r.origin?.trim() || "",
          r.destination?.trim() || "",
          r.deliveredLabel,
          r.days != null ? String(r.days) : "",
          BANDS[bandOf(r.days)].badge,
          String(Math.round(r.rate)),
          String(Math.round(r.rate)),
        ]
          .map(esc)
          .join(","),
      ),
    ];
    // BOM so Excel opens the UTF-8 correctly; CRLF for the same reason.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `accounts-receivable-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ar-screen min-h-screen bg-canvas text-fg">
      {/* PAGE CANVAS. The white cards are meant to float on a deeper, cooler
          canvas (Stripe/Mercury fintech look), so this screen repoints the
          themed --canvas token to a slate-tinted shade a clear step darker than
          the admin default (#e9ecef light / #2b2b2b dark). Overriding the token
          — rather than hard-coding a background — keeps bg-canvas/text-fg
          theme-safe: text-fg still flips light↔dark, and .admin-dark still wins
          via higher specificity. Scoped to .ar-screen so no other admin page
          shifts. */}
      <style>{`
        .ar-screen { --canvas: #d3dbe5; }
        .admin-dark .ar-screen { --canvas: #202329; }
      `}</style>
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* ── Header ──────────────────────────────────────────────────────
            One row, and nothing above it: the way back to the board on the
            left, Export on the right. The page title and subtitle were
            dropped at the owner's request — the tab title and the summary
            card's "Outstanding Balance" already say what this screen is, and
            the back button is what the owner actually reaches for. */}
        <header className="flex items-center justify-between gap-3">
          <Button
            href="/admin/dispatch/loads"
            variant="navigate"
            size="md"
            leftIcon={<ArrowLeftIcon className="h-3.5 w-3.5" />}
          >
            Load Board
          </Button>
          <Button
            type="button"
            variant="navigate"
            size="md"
            onClick={exportCsv}
            leftIcon={<ExportIcon className="h-3.5 w-3.5" />}
          >
            Export
          </Button>
        </header>

        {/* ── Summary ────────────────────────────────────────────────────── */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-card shadow-e2">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8">
            {/* Left — the one number this page exists for. */}
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                Outstanding Balance
              </div>
              <div className="mt-2 text-[40px] font-bold leading-none tracking-[-0.02em] tabular-nums text-fg sm:text-[48px]">
                {usd(arTotal)}
              </div>
              <div className="mt-2.5 text-[13px] tabular-nums text-fg-muted">
                {outstanding.length} unpaid invoice
                {outstanding.length === 1 ? "" : "s"}
              </div>
              <a
                href="#aging"
                className="mt-4 inline-flex items-center gap-1.5 rounded-md text-[12.5px] font-semibold text-accent transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                View aging report
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Right — the same money, split by how late it is. */}
            <div id="aging" className="min-w-0 scroll-mt-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
                Aging Summary
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
                {BAND_ORDER.map((k) => (
                  <div
                    key={k}
                    className="min-w-0 rounded-xl bg-inset px-3 py-3 shadow-e1"
                  >
                    <div className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                      {BANDS[k].column}
                    </div>
                    <div
                      className={
                        "mt-1.5 truncate text-[19px] font-bold leading-none tabular-nums " +
                        BANDS[k].value
                      }
                    >
                      {usd(buckets[k].total)}
                    </div>
                    <div className="mt-1.5 text-[11px] tabular-nums text-ink-3">
                      {buckets[k].count} invoice
                      {buckets[k].count === 1 ? "" : "s"}
                    </div>
                  </div>
                ))}
              </div>
              {buckets.none.count > 0 ? (
                <p className="mt-2.5 text-[11.5px] text-fg-subtle">
                  {buckets.none.count} invoice
                  {buckets.none.count === 1 ? "" : "s"} ({usd(buckets.none.total)})
                  have no delivery date and can&rsquo;t be aged.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* ── Filter / sort utility row ──────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-semibold tabular-nums text-fg-muted">
            {visible.length} Result{visible.length === 1 ? "" : "s"}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              className={
                "inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (band === "all"
                  ? "border-line-strong bg-card text-fg hover:bg-elevated"
                  : "border-accent bg-accent text-white")
              }
            >
              <FilterIcon className="h-3.5 w-3.5" />
              {band === "all" ? "Filter" : BANDS[band].chip}
            </button>

            <div className="relative">
              <select
                aria-label="Sort receivables"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-[34px] appearance-none rounded-lg border border-line-strong bg-card py-0 pl-3 pr-8 text-[12.5px] font-semibold text-fg outline-none transition-colors hover:bg-elevated focus:border-accent focus:ring-2 focus:ring-accent/40"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
              <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            </div>
          </div>
        </div>

        {/* Band chips — revealed by Filter, so the resting utility row stays
            two controls wide on a phone. */}
        {filterOpen ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-card p-2.5 shadow-e1">
            <FilterChip
              active={band === "all"}
              onClick={() => setBand("all")}
              label="All"
              count={outstanding.length}
            />
            {BAND_ORDER.map((k) => (
              <FilterChip
                key={k}
                active={band === k}
                onClick={() => setBand(k)}
                label={BANDS[k].chip}
                count={buckets[k].count}
              />
            ))}
            {buckets.none.count > 0 ? (
              <FilterChip
                active={band === "none"}
                onClick={() => setBand("none")}
                label={BANDS.none.chip}
                count={buckets.none.count}
              />
            ) : null}
          </div>
        ) : null}

        {/* ── Invoice cards ──────────────────────────────────────────────── */}
        {outstanding.length === 0 ? (
          <EmptyState
            title="All caught up"
            body="Nothing outstanding — every delivered load has been paid."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No invoices in this range"
            body="Clear the filter to see the rest of the book."
          />
        ) : (
          <div className="mt-4 space-y-3.5">
            {visible.map((r) => (
              <InvoiceCard key={r.id} r={r} />
            ))}
          </div>
        )}

        {/* ── Recently paid ──────────────────────────────────────────────── */}
        {recentlyPaid.length > 0 ? (
          <section className="mt-8">
            {/* text-fg-muted, not -subtle: this label sits directly on the
                darker page canvas, where -subtle (#727a84) would drop to ~3:1. */}
            <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              Recently Paid
            </h2>
            <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-e1">
              {recentlyPaid.map((l, i) => (
                <div
                  key={l.id}
                  className={
                    "flex items-center justify-between gap-3 px-4 py-3 " +
                    (i > 0 ? "border-t border-line" : "")
                  }
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-bg text-ok">
                      <CheckIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-fg">
                        {l.brokerName?.trim() || "—"}
                      </div>
                      <div className="truncate text-[11.5px] tabular-nums text-fg-subtle">
                        #{l.loadNumber?.trim() || "—"} · {usd(l.rate)}
                      </div>
                    </div>
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

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        // Both states are fixed-color surfaces so the chips read the same on
        // either admin theme.
        (active
          ? "bg-graphite text-white"
          : "bg-inset text-ink-2 hover:bg-[#e4e9ed]")
      }
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-card px-6 py-14 text-center shadow-e1">
      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-ok-bg text-ok">
        <CheckIcon className="h-5 w-5" />
      </span>
      <div className="mt-3.5 text-[15px] font-semibold text-fg">{title}</div>
      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-fg-muted">
        {body}
      </p>
    </div>
  );
}

/**
 * One broker invoice. Reads top-to-bottom as: who owes it → what it was →
 * how late it is → how much → what to do about it.
 *
 * The whole card body still taps through to the broker profile, exactly as
 * before, via a stretched overlay link rather than a wrapping <a> — the
 * action row contains a form and two links of its own, which can't legally
 * nest inside an anchor. Everything interactive in the action row sits at
 * z-10, above the overlay.
 */
function InvoiceCard({ r }: { r: ReceivableItem }) {
  const k = bandOf(r.days);
  const b = BANDS[k];
  const brokerHref = r.brokerId ? `/admin/dispatch/brokers/${r.brokerId}` : null;

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-card shadow-e2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-e3">
      <div className="p-4 sm:p-5">
        {/* Identity + aging */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {/* Navy avatar — fixed graphite fill, white initials. */}
            <span
              aria-hidden
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-graphite text-[14px] font-bold tracking-[0.02em] text-white shadow-e1"
            >
              {initials(r.brokerName)}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-[19px] font-bold leading-tight tracking-[-0.01em] text-fg sm:text-[22px]">
                {r.brokerName?.trim() || "—"}
              </h3>
              <p className="mt-1 truncate text-[13px] text-fg-muted">
                {r.origin?.trim() || "—"}{" "}
                <span className="text-fg-subtle">→</span>{" "}
                {r.destination?.trim() || "—"}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <span
              className={
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] leading-none " +
                b.pill
              }
            >
              {b.badge}
            </span>
            <div className="mt-2.5 text-[28px] font-bold leading-none tabular-nums text-fg">
              {r.days != null ? r.days : "—"}
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-fg-subtle">
              Days Out
            </div>
          </div>
        </div>

        {/* Identity pills */}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pl-0 sm:pl-14">
          <span className="inline-flex items-center gap-1 rounded-md bg-steel-bg px-2 py-1 text-[11.5px] font-bold tabular-nums leading-none text-steel">
            <DocumentIcon className="h-3 w-3" />#{r.loadNumber?.trim() || "—"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-inset px-2 py-1 text-[11.5px] font-semibold tabular-nums leading-none text-ink-2">
            <CalendarIcon className="h-3 w-3" />
            Delivered {r.deliveredLabel}
          </span>
        </div>

        {/* Financials. On the fixed-light inset panel so the red balance and
            the ink labels stay legible under the dark admin theme. */}
        <div className="mt-4 grid grid-cols-3 rounded-xl bg-inset shadow-e1">
          <Figure label="Invoice" value={usd(r.rate)} icon />
          {/* No partial payments exist in the schema — an unpaid load owes its
              full rate, so Balance Due is the invoice amount until it clears. */}
          <Figure label="Balance Due" value={usd(r.rate)} accent divider />
          {/* There is no separate invoice date column; a load becomes billable
              on delivery, which is the date A/R is aged from. */}
          <Figure label="Invoiced On" value={r.deliveredLabel} divider />
        </div>
      </div>

      {/* Actions. Above the stretched link (z-10) so submitting Mark as paid
          never doubles as a navigation to the broker. */}
      <div className="relative z-10 grid grid-cols-2 gap-2 border-t border-line px-4 py-3 sm:grid-cols-3 sm:px-5">
        <Button
          href={`/admin/dispatch/loads/${r.id}`}
          prefetch={false}
          variant="navigate"
          size="md"
          fullWidth
        >
          View Details
        </Button>
        {brokerHref ? (
          <Button
            href={brokerHref}
            prefetch={false}
            variant="navigate"
            size="md"
            fullWidth
            leftIcon={<PhoneIcon className="h-3.5 w-3.5" />}
          >
            Contact
          </Button>
        ) : (
          <Button variant="navigate" size="md" fullWidth disabled>
            Contact
          </Button>
        )}
        <form
          action={markLoadPaid.bind(null, r.id)}
          className="col-span-2 sm:col-span-1"
        >
          <MarkPaidButton />
        </form>
      </div>

      {/* Stretched broker link — the card BODY taps through, as it always has.
          Rendered last so it stacks under the action row above. */}
      {brokerHref ? (
        <Link
          href={brokerHref}
          prefetch={false}
          aria-label={`Open ${r.brokerName?.trim() || "broker"} profile`}
          className="absolute inset-x-0 top-0 bottom-[58px] rounded-t-2xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        />
      ) : null}
    </article>
  );
}

/** One cell of the card's three-up financial row. */
function Figure({
  label,
  value,
  accent = false,
  divider = false,
  icon = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  divider?: boolean;
  icon?: boolean;
}) {
  return (
    <div
      className={
        "min-w-0 px-2.5 py-3 " +
        (divider ? "border-l border-line-strong/60" : "")
      }
    >
      {/* Sized to survive a 375px viewport: at ~83px of column text width, a
          14-char "INVOICE AMOUNT" (label shortened to "Invoice") and a 9-char
          "6/22/2026" value both used to clip. 9px labels and a 13px value
          (bumping back up at sm, where the columns are far wider) show every
          label and a full M/DD/YYYY date, year included, with no ellipsis. */}
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.06em] text-ink-3">
        {icon ? <DollarIcon className="h-3 w-3 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={
          "mt-1.5 truncate text-[13px] font-bold leading-tight tabular-nums sm:text-[15px] " +
          (accent ? "text-accent" : "text-ink")
        }
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Mark as paid. useFormStatus disables the button and swaps in a spinner while
 * the server action is in flight, so a slow round-trip can't be double-fired
 * and the owner gets feedback on the tap.
 */
function MarkPaidButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="md"
      fullWidth
      disabled={pending}
      aria-busy={pending}
      leftIcon={
        pending ? (
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        ) : undefined
      }
    >
      {pending ? "Marking…" : "Mark as Paid"}
    </Button>
  );
}
