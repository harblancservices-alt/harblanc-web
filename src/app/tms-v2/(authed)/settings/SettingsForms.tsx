"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/tms-v2/ui/Button";
import { updateFuelSettings, updateProfitGoals } from "@/actions/tms-v2/settings";
import type { MutationResult } from "@/lib/demo/mutation";
import type { DispatchSettingsSummary } from "@/lib/data/settings";

type SaveState = { ok: boolean; error: string | null };
const INITIAL: SaveState = { ok: false, error: null };

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-fg-muted";
const FIELD =
  "mt-1 h-10 w-full rounded-md border border-line-strong bg-card px-2.5 text-[14px] text-fg outline-none focus:border-fg";

/** Settings' write forms — fuel/factoring and profit-goal targets, the
 * inputs nearly every net-profit calc in the app depends on. Closes the
 * audit's Critical Settings gap: "every value on the page is a display row,
 * nothing is a form." Two separate forms/actions (matching V1's split) so
 * saving one never clobbers the other's fields. */
export function FuelSettingsForm({ settings, disabled }: { settings: DispatchSettingsSummary; disabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await updateFuelSettings(formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!editing) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ReadField label="MPG" value={settings.mpg.toString()} />
        <ReadField label="Diesel $/gal" value={`$${settings.dieselPricePerGallon.toFixed(2)}`} />
        <ReadField label="Factoring %" value={`${settings.factoringPct}%`} />
        <div className="col-span-full">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={disabled}>
            Edit business defaults
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label>
          <span className={LABEL}>MPG</span>
          <input name="mpg" type="number" step="any" min="0.1" defaultValue={settings.mpg} required className={FIELD} />
        </label>
        <label>
          <span className={LABEL}>Diesel $/gal</span>
          <input name="diesel_price_per_gallon" type="number" step="any" min="0.01" defaultValue={settings.dieselPricePerGallon} required className={FIELD} />
        </label>
        <label>
          <span className={LABEL}>Factoring %</span>
          <input name="factoring_pct" type="number" step="any" min="0" max="100" defaultValue={settings.factoringPct} required className={FIELD} />
        </label>
      </div>
      {state.error ? <p className="text-[13px] font-medium text-bad">{state.error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ProfitGoalsForm({ settings, disabled }: { settings: DispatchSettingsSummary; disabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (_prev, formData) => {
    const result: MutationResult = await updateProfitGoals(formData);
    return result.ok ? { ok: true, error: null } : { ok: false, error: result.reason };
  }, INITIAL);

  useEffect(() => {
    if (state.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state.ok, router]);

  if (!editing) {
    return (
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ReadField label="Monthly net goal" value={`$${settings.monthlyNetGoal.toLocaleString()}`} />
        <ReadField label="Annual net goal" value={`$${settings.annualNetGoal.toLocaleString()}`} />
        <ReadField label="Current cash" value={`$${settings.currentCash.toLocaleString()}`} />
        <div className="col-span-full">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={disabled}>
            Edit profit goals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label>
          <span className={LABEL}>Monthly net goal ($)</span>
          <input name="monthly_net_goal" type="number" step="any" min="0" defaultValue={settings.monthlyNetGoal} required className={FIELD} />
        </label>
        <label>
          <span className={LABEL}>Annual net goal ($)</span>
          <input name="annual_net_goal" type="number" step="any" min="0" defaultValue={settings.annualNetGoal} required className={FIELD} />
        </label>
      </div>
      {state.error ? <p className="text-[13px] font-medium text-bad">{state.error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-elevated px-3 py-2.5">
      <p className={LABEL}>{label}</p>
      <p className="mt-1 text-[14px] tabular-nums text-fg">{value}</p>
    </div>
  );
}
