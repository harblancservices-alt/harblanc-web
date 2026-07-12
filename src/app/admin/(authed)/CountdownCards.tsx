"use client";

import { useEffect, useState, useTransition } from "react";
import {
  computeBreakdown,
  type CountdownGoal,
  type NetPace,
} from "@/lib/dispatch/countdown";
import {
  createCountdownGoal,
  deleteCountdownGoal,
  updateCountdownGoal,
} from "./countdown-actions";

/**
 * Dashboard countdown widget (render layer).
 *
 * Two square white cards (one per goal) showing a big "N days left" count and
 * the target date in an inset pill. Tapping a card opens a READ-ONLY breakdown
 * (required pace, loads needed, on-pace verdict) computed live from the goal +
 * the recent load-net aggregates the server passed in. The only writes are
 * editing/adding/removing the goals themselves, via the edit modal.
 *
 * Deliberately OFF the admin theme: fixed white surface + dark ink + normal
 * sans (no mono, no graphite, no red bar) per the approved look. `today` is
 * computed server-side (same convention as the Calendar) so days-left ticks
 * down by date with no hydration drift; the page revalidates each day.
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
  today,
}: {
  goals: ReadonlyArray<CountdownGoal>;
  pace: NetPace;
  today: string;
}) {
  // `null` = closed. A string id opens the breakdown for that goal. The edit
  // modal is a separate piece of state: { mode: "edit", goal } | { mode: "new" }.
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<
    { mode: "edit"; goal: CountdownGoal } | { mode: "new" } | null
  >(null);

  const openGoal = goals.find((g) => g.id === openId) ?? null;

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Countdown
        </span>
        <button
          type="button"
          onClick={() => setEditing({ mode: "new" })}
          className="rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-neutral-700 shadow-sm ring-1 ring-black/10 transition hover:bg-neutral-50"
        >
          + Add
        </button>
      </div>

      {goals.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing({ mode: "new" })}
          className="flex w-full items-center justify-center rounded-2xl bg-white px-4 py-8 text-[13px] font-medium text-neutral-500 shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition hover:bg-neutral-50"
        >
          Add your first countdown goal
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {goals.map((g) => {
            const b = computeBreakdown(g, pace, today);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setOpenId(g.id)}
                className="group relative flex aspect-square flex-col justify-between rounded-2xl bg-white p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] active:scale-[0.99]"
              >
                <span className="line-clamp-2 text-[14px] font-semibold leading-tight text-neutral-900">
                  {g.label}
                </span>

                <span className="flex flex-col items-start">
                  <span className="text-[44px] font-bold leading-none tracking-tight tabular-nums text-neutral-900 sm:text-[52px]">
                    {b.daysLeft}
                  </span>
                  <span className="mt-1 text-[12px] font-medium text-neutral-500">
                    {b.daysLeft === 1 ? "day left" : "days left"}
                  </span>
                </span>

                <span className="inline-flex w-fit items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-neutral-600">
                  {longDate(g.targetDate)}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
