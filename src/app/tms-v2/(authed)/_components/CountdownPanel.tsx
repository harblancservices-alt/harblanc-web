"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/tms-v2/ui/Button";
import { Modal } from "@/components/tms-v2/ui/Modal";
import { formatMoney } from "@/lib/domain/money";
import { daysUntil, timeProgressPct, type CountdownGoal } from "@/lib/dispatch/countdown";
import { createCountdownGoal, updateCountdownGoal, deleteCountdownGoal } from "@/actions/tms-v2/countdown";
import { updateCurrentCash } from "@/actions/tms-v2/settings";
import type { MutationResult } from "@/lib/demo/mutation";

/**
 * Dashboard's Countdown panel — Brent's "Option 2, dark header" spec: a
 * fixed-dark top strip (not theme-dependent, like the admin `bg-bar`
 * treatment — see harblanc-admin-theme-scoping precedent) carrying
 * "COUNTDOWN · to go" + the combined target total + a red "+ Add", then a
 * white body of goal rows (name / target / days-left / green time-progress
 * bar — lib/dispatch/countdown.ts's timeProgressPct, reused as-is), then
 * Current cash with an inline-editable pencil at the bottom. Simplified
 * from legacy: tapping a goal opens Edit directly rather than a read-only
 * pace-breakdown modal first (the weekly/loads-needed verdict needs a
 * trailing-12-week net-pace query this pass doesn't add — flagged, not
 * silently dropped). The only add path is the dark header's "+ Add"
 * button — an earlier pass also had a separate dashed "+ Add a countdown
 * goal" card below the panel, which Brent asked removed as redundant. A
 * final visual pass is expected once he sends his mockup, so this stays
 * easy to restyle.
 */
export function CountdownPanel({ goals, currentCash, today }: { goals: CountdownGoal[]; currentCash: number; today: string }) {
  const [editing, setEditing] = useState<{ mode: "edit"; goal: CountdownGoal } | { mode: "new" } | null>(null);
  const total = goals.reduce((sum, g) => sum + g.targetAmount, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-line shadow-e1">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3" style={{ backgroundColor: "#151A22" }}>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Countdown · to go</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-[17px] font-bold tabular-nums text-white">{formatMoney(total)}</span>
            <Button type="button" variant="destructive" size="sm" onClick={() => setEditing({ mode: "new" })}>
              + Add
            </Button>
          </div>
        </div>

        <div className="bg-card">
          {goals.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-[13px] text-fg-muted">No countdown goals yet.</p>
          ) : (
            goals.map((g) => {
              const daysLeft = Math.max(0, daysUntil(g.targetDate, today));
              const pct = timeProgressPct(g, today);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setEditing({ mode: "edit", goal: g })}
                  className="block w-full border-b border-line px-3.5 py-2.5 text-left transition-colors hover:bg-elevated"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium text-fg">{g.label}</span>
                    <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      <span className="text-[13px] font-semibold text-fg">{formatMoney(g.targetAmount)}</span>
                      <span className="text-[11px] font-medium text-fg-muted">
                        {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                    <div className="h-full bg-ok" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })
          )}

          <CurrentCashRow currentCash={currentCash} total={total} />
        </div>
      </div>

      {editing ? <EditGoalModal goal={editing.mode === "edit" ? editing.goal : null} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CurrentCashRow({ currentCash, total }: { currentCash: number; total: number }) {
  const [isEditing, setIsEditing] = useState(false);
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
      const result: MutationResult = await updateCurrentCash(fd);
      if (result.ok) setIsEditing(false);
      else setError(result.reason);
    });
  }

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg-muted">Current cash</span>
        {isEditing ? (
          <form onSubmit={save} className="flex shrink-0 items-center gap-1.5">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              className="w-28 rounded-md border border-line-strong bg-card px-2 py-1 text-right text-[13px] tabular-nums text-fg focus:border-fg focus:outline-none"
            />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => { setValue(currentCash ? String(currentCash) : ""); setError(null); setIsEditing(false); }}>
              Cancel
            </Button>
          </form>
        ) : (
          <button type="button" onClick={() => setIsEditing(true)} className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[14px] font-semibold tabular-nums text-fg hover:bg-elevated">
            {formatMoney(currentCash)}
            <span aria-hidden className="text-[12px] text-fg-subtle">✎</span>
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[11px] text-fg-subtle">{covered ? "Goal total" : "Short of total"}</span>
        {covered ? (
          <span className="text-[12px] font-semibold text-ok">
            Fully covered{shortfall < 0 ? ` · ${formatMoney(-shortfall)} over` : ""}
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-warn">Short {formatMoney(shortfall)}</span>
        )}
      </div>
      {error ? <p className="mt-1 text-[12px] text-bad">{error}</p> : null}
    </div>
  );
}

function EditGoalModal({ goal, onClose }: { goal: CountdownGoal | null; onClose: () => void }) {
  const isEdit = !!goal;
  const [label, setLabel] = useState(goal?.label ?? "");
  const [subtitle, setSubtitle] = useState(goal?.subtitle ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = goal ? await updateCountdownGoal(goal.id, fd) : await createCountdownGoal(fd);
      if (result.ok) onClose();
      else setError(result.reason);
    });
  }

  function onDelete() {
    if (!goal || pending) return;
    if (!confirm(`Remove the "${goal.label}" countdown? This can't be undone.`)) return;
    setError(null);
    start(async () => {
      const result: MutationResult = await deleteCountdownGoal(goal.id);
      if (result.ok) onClose();
      else setError(result.reason);
    });
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit countdown" : "New countdown"}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Label
          <input
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            placeholder="e.g. Transmission"
            className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg focus:border-fg focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
          Subtitle
          <input
            name="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="e.g. Promo payoff"
            className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg focus:border-fg focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
            Target amount
            <input
              name="target_amount"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] tabular-nums text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-fg">
            Target date
            <input
              name="target_date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              required
              className="h-10 rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg focus:border-fg focus:outline-none"
            />
          </label>
        </div>

        {error ? <p className="text-[13px] font-medium text-bad">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          {isEdit ? (
            <button type="button" onClick={onDelete} disabled={pending} className="mr-auto text-[13px] font-medium text-bad hover:underline disabled:opacity-50">
              Remove
            </button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : isEdit ? "Save" : "Add goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
