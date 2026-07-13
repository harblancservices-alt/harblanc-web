"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import {
  computeBreakdown,
  timeProgressPct,
  type CountdownGoal,
  type NetPace,
} from "@/lib/dispatch/countdown";
import { IntervalBar } from "./maintenance/IntervalBar";
import {
  createCountdownGoal,
  deleteCountdownGoal,
  updateCountdownGoal,
  updateCurrentCash,
} from "./countdown-actions";

/**
 * Dashboard countdown widget (render layer).
 *
 * One progress-bar row per goal, styled to match the Truck Maintenance rows
 * right above it: goal name on the left, a green time-progress bar, and the
 * target amount + days-left on the right. The bar tracks elapsed time toward
 * the deadline — (today − created) / (target − created). Tapping a row opens
 * the READ-ONLY breakdown (required pace, loads needed, on-pace verdict); the
 * subtitle and per-week/per-day figures live only there, never on the row.
 *
 * The breakdown/edit modals stay off the admin theme (fixed white surface,
 * normal sans). `today` is computed server-side (same convention as the
 * Calendar) so days-left ticks down by date with no hydration drift.
 */

function money(n: number, decimals = 0): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/** "2026-09-08" → "Sep 8, 2026" without pulling in local-timezone drift. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`;
}

export function CountdownCards({
  goals,
  pace,
  currentCash,
  today,
}: {
  goals: ReadonlyArray<CountdownGoal>;
  pace: NetPace;
  currentCash: number;
  today: string;
}) {
  // `null` = closed. A string id opens the breakdown for that goal. The edit
  // modal is a separate piece of state: { mode: "edit", goal } | { mode: "new" }.
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    { mode: "edit"; goal: CountdownGoal } | { mode: "new" } | null
  >(null);

  const openGoal = goals.find((g) => g.id === openId) ?? null;

  // Total money to hit across every goal — the "balance" shown on the black
  // title bar and the figure current cash is measured against for the shortfall.
  const total = goals.reduce((sum, g) => sum + g.targetAmount, 0);

  return (
    <>
      <div className="overflow-hidden rounded-md border border-line bg-card shadow-e2">
        {/* Black title bar — the app's graphite section-header treatment. Holds
            the title, the combined target as the running balance, and a real
            primary "+ Add" button (not a text link). */}
        <div className="flex min-h-[48px] items-center justify-between gap-2 bg-bar px-3 py-2">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bar-fg">
              Countdown
            </h2>
            <span className="font-mono text-[13px] font-bold tabular-nums text-bar-fg">
              {money(total, 2)}
            </span>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setEditing({ mode: "new" })}
            className="shrink-0"
          >
            + Add
          </Button>
        </div>

        {/* Goal rows — one green time-progress row each, tapping opens the
            read-only breakdown. Unchanged from before. */}
        {goals.length === 0 ? (
          <button
            type="button"
            onClick={() => setEditing({ mode: "new" })}
            className="flex w-full items-center justify-center border-b border-line px-4 py-6 text-[12px] font-medium text-ink-3 transition-colors hover:bg-inset"
          >
            + Add your first countdown goal
          </button>
        ) : (
          goals.map((g) => {
            const b = computeBreakdown(g, pace, today);
            const pct = timeProgressPct(g, today);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setOpenId(g.id)}
                className="block w-full border-b border-line px-3.5 py-2.5 text-left transition-colors hover:bg-inset"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-fg">
                    {g.label}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
                    <span className="text-[13px] font-bold text-ok">
                      {money(g.targetAmount)}
                    </span>
                    <span className="text-[11px] font-bold text-fg-muted">
                      {b.daysLeft} {b.daysLeft === 1 ? "day" : "days"} left
                    </span>
                  </span>
                </div>
                <div className="mt-1.5">
                  <IntervalBar pct={pct} status="ok" className="h-2" />
                </div>
              </button>
            );
          })
        )}

        {/* Current cash (owner-entered, persisted) + the shortfall gap to the
            total. Sits at the very bottom, under the goal rows. */}
        <CurrentCashRow currentCash={currentCash} total={total} />
      </div>

      {openGoal ? (
        <BreakdownModal
          goal={openGoal}
          pace={pace}
          today={today}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setEditing({ mode: "edit", goal: openGoal });
            setOpenId(null);
          }}
        />
      ) : null}

      {editing ? (
        <EditGoalModal
          goal={editing.mode === "edit" ? editing.goal : null}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/* ---------------------------- Current cash row ---------------------------- */

/**
 * The owner-entered cash on hand, persisted to dispatch_settings, plus the
 * shortfall gap to the combined goal total. Tap the amount to edit it inline;
 * Enter or Save writes it through `updateCurrentCash`. The gap is total − cash:
 * red "Short $X" while under, green "Fully covered" once cash clears the total.
 */
function CurrentCashRow({
  currentCash,
  total,
}: {
  currentCash: number;
  total: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentCash ? String(currentCash) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shortfall = total - currentCash;
  const covered = shortfall <= 0;

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData();
    fd.set("current_cash", value);
    setError(null);
    start(async () => {
      try {
        await updateCurrentCash(fd);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3">
          Current cash
        </span>
        {editing ? (
          <form onSubmit={save} className="flex shrink-0 items-center gap-1.5">
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12px] text-fg-muted">
                $
              </span>
              <input
                name="current_cash"
                value={value}
                onChange={(ev) => setValue(ev.target.value)}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0.00"
                className="w-28 rounded-md border border-line-strong bg-card py-1 pl-5 pr-2 text-right font-mono text-[13px] tabular-nums text-fg outline-none focus:border-accent"
              />
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? "…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="cancel"
              size="sm"
              disabled={pending}
              onClick={() => {
                setValue(currentCash ? String(currentCash) : "");
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[14px] font-bold tabular-nums text-fg transition-colors hover:bg-inset"
          >
            {money(currentCash, 2)}
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className="h-3.5 w-3.5 text-fg-subtle"
            >
              <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-8.35 8.35a2 2 0 0 1-.878.507l-3.007.86a.5.5 0 0 1-.618-.618l.86-3.007a2 2 0 0 1 .507-.878l8.35-8.35z" />
            </svg>
          </button>
        )}
      </div>

      {/* Shortfall gap — total needed minus cash on hand. */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
          {covered ? "Goal total" : "Short of total"}
        </span>
        {covered ? (
          <span className="font-mono text-[12px] font-bold tabular-nums text-ok">
            Fully covered
            {shortfall < 0 ? ` · ${money(-shortfall, 2)} over` : ""}
          </span>
        ) : (
          <span className="font-mono text-[13px] font-bold tabular-nums text-bad">
            Short {money(shortfall, 2)}
          </span>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] font-semibold text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------- Breakdown modal ---------------------------- */

function BreakdownModal({
  goal,
  pace,
  today,
  onClose,
  onEdit,
}: {
  goal: CountdownGoal;
  pace: NetPace;
  today: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const b = computeBreakdown(goal, pace, today);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ModalShell onClose={onClose}>
      <div className="px-5 pb-5 pt-4">
        <h2 className="text-[19px] font-bold tracking-tight text-neutral-900">
          {goal.label}
        </h2>
        {goal.subtitle ? (
          <p className="mt-0.5 text-[13px] text-neutral-500">{goal.subtitle}</p>
        ) : null}

        {/* Target + deadline headline */}
        <div className="mt-4 flex items-end justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3 ring-1 ring-black/5">
          <div>
            <div className="text-[26px] font-bold tabular-nums text-neutral-900">
              {money(goal.targetAmount, 2)}
            </div>
            <div className="mt-0.5 text-[12px] font-medium text-neutral-500">
              Need by {longDate(goal.targetDate)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[26px] font-bold tabular-nums text-neutral-900">
              {b.daysLeft}
            </div>
            <div className="mt-0.5 text-[12px] font-medium text-neutral-500">
              {b.daysLeft === 1 ? "day left" : "days left"}
            </div>
          </div>
        </div>

        {/* Required pace */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat
            label="Per week"
            value={money(b.perWeek, 2)}
            sub={`${b.weeksLeft} ${b.weeksLeft === 1 ? "week" : "weeks"} left`}
          />
          <Stat
            label="Per day"
            value={money(b.perDay, 2)}
            sub={`${b.daysLeft} ${b.daysLeft === 1 ? "day" : "days"} left`}
          />
        </div>

        <div className="mt-3">
          <Stat
            label="Loads needed"
            value={b.loadsNeeded == null ? "—" : `≈ ${b.loadsNeeded}`}
            sub={
              pace.avgNetPerLoad > 0
                ? `at ${money(pace.avgNetPerLoad, 0)} net/load (recent avg)`
                : "no recent delivered loads to average"
            }
            wide
          />
        </div>

        {/* Verdict */}
        <div
          className={
            "mt-4 rounded-xl px-4 py-3 ring-1 " +
            (!b.hasPace
              ? "bg-neutral-50 ring-black/5"
              : b.onPace
                ? "bg-emerald-50 ring-emerald-600/20"
                : "bg-red-50 ring-red-600/20")
          }
        >
          {!b.hasPace ? (
            <p className="text-[13px] font-medium text-neutral-500">
              Not enough recent net to gauge pace yet.
            </p>
          ) : b.onPace ? (
            <p className="text-[13.5px] font-semibold text-emerald-700">
              On pace — averaging {money(pace.weeklyNetPace, 0)}/week, above the{" "}
              {money(b.perWeek, 0)} you need.
            </p>
          ) : (
            <p className="text-[13.5px] font-semibold text-red-700">
              Behind — averaging {money(pace.weeklyNetPace, 0)}/week, need{" "}
              {money(b.perWeek, 0)}.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-neutral-600 transition hover:bg-neutral-100"
        >
          Edit goal
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-neutral-700"
        >
          Done
        </button>
      </div>
    </ModalShell>
  );
}

function Stat({
  label,
  value,
  sub,
  wide,
}: {
  label: string;
  value: string;
  sub: string;
  wide?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl bg-white px-4 py-3 ring-1 ring-black/5 " +
        (wide ? "" : "")
      }
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 text-[20px] font-bold tabular-nums text-neutral-900">
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] font-medium text-neutral-500">
        {sub}
      </div>
    </div>
  );
}

/* ------------------------------- Edit modal ------------------------------- */

function EditGoalModal({
  goal,
  onClose,
}: {
  goal: CountdownGoal | null;
  onClose: () => void;
}) {
  const isEdit = !!goal;
  const [label, setLabel] = useState(goal?.label ?? "");
  const [subtitle, setSubtitle] = useState(goal?.subtitle ?? "");
  const [amount, setAmount] = useState(
    goal ? String(goal.targetAmount) : "",
  );
  const [date, setDate] = useState(goal?.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      try {
        if (goal) await updateCountdownGoal(goal.id, fd);
        else await createCountdownGoal(fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save goal.");
      }
    });
  }

  function onDelete() {
    if (!goal || pending) return;
    if (!confirm(`Remove the "${goal.label}" countdown? This can't be undone.`)) {
      return;
    }
    setError(null);
    start(async () => {
      try {
        await deleteCountdownGoal(goal.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove goal.");
      }
    });
  }

  return (
    <ModalShell onClose={() => (pending ? undefined : onClose())}>
      <form onSubmit={onSubmit}>
        <div className="px-5 pb-5 pt-4">
          <h2 className="text-[18px] font-bold tracking-tight text-neutral-900">
            {isEdit ? "Edit countdown" : "New countdown"}
          </h2>

          <div className="mt-4 space-y-3">
            <Field label="Label">
              <input
                name="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                autoComplete="off"
                placeholder="e.g. Transmission"
                className={INPUT}
              />
            </Field>
            <Field label="Subtitle">
              <input
                name="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                autoComplete="off"
                placeholder="e.g. Promo payoff · beat the predatory rate"
                className={INPUT}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target amount">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-neutral-400">
                    $
                  </span>
                  <input
                    name="target_amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    className={INPUT + " pl-6 tabular-nums"}
                  />
                </div>
              </Field>
              <Field label="Target date">
                <input
                  name="target_date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className={INPUT + " block min-w-0"}
                />
              </Field>
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-3 text-[12.5px] font-semibold text-red-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          {isEdit ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="mr-auto rounded-lg px-3 py-1.5 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : isEdit ? "Save" : "Add goal"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

const INPUT =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-neutral-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-3 pb-6 pt-[max(env(safe-area-inset-top),1.5rem)] sm:pt-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
