"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAiAgent, IconPlus, IconTruck, IconX } from "../../_shell/icons";
import { PILL, PILL_SIZE, PILL_INACTIVE, PILL_DASHED } from "../../_shell/compactForm";
import { COMMODITY_PRESETS } from "./details-fields";
import { setCommodities } from "./details-actions";

/**
 * The profile's "Commodities" subsection — replaces the old "Freight
 * Profile" section (equipment/lanes/volume/weight/special dropped from the
 * profile per Brent's 2026-08-12 call; "just commodities and tags" here).
 * Same inline tap-pill-picker pattern as TagsCard: current commodities show
 * as removable chips, "+ Add commodity" reveals a collapsed picker of
 * COMMODITY_PRESETS plus a "…or type your own" custom input. Unlike tags,
 * commodities have no join table — crm_accounts.commodities is a single
 * comma-separated string column, so every add/remove just recomputes the
 * full list and writes it via setCommodities. Owns no Card/CardHead of its
 * own — the parent card supplies the outer chrome.
 */
export function CommoditiesCard({
  accountId,
  commodities,
  fromAi,
}: {
  accountId: string;
  commodities: string[];
  fromAi?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyValue, setBusyValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [customText, setCustomText] = useState("");
  const router = useRouter();

  const currentLower = new Set(commodities.map((c) => c.toLowerCase()));
  const availablePresets = COMMODITY_PRESETS.filter((label) => !currentLower.has(label.toLowerCase()));

  function togglePicker() {
    setPickerOpen((open) => {
      const next = !open;
      if (!next) {
        setAdding(false);
        setCustomText("");
      }
      return next;
    });
  }

  function save(next: string[], busyKey: string) {
    if (pending) return;
    setError(null);
    setBusyValue(busyKey);
    startTransition(async () => {
      const res = await setCommodities(accountId, next);
      setBusyValue(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function addPreset(label: string) {
    save([...commodities, label], label);
  }

  function remove(label: string) {
    save(
      commodities.filter((c) => c !== label),
      label,
    );
  }

  function addCustom() {
    const label = customText.trim();
    if (!label) return;
    setAdding(false);
    setCustomText("");
    save([...commodities, label], label);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ok/10 text-ok">
            <IconTruck width={13} height={13} />
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg">Commodities</h3>
        </div>
        <button
          type="button"
          onClick={togglePicker}
          className={`inline-flex items-center gap-1 text-[11.5px] font-semibold transition-colors ${pickerOpen ? "text-fg-muted hover:text-fg" : "text-accent hover:text-accent-hover"}`}
        >
          {pickerOpen ? (
            "Done"
          ) : (
            <>
              <IconPlus width={11} height={11} />
              Add commodity
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {commodities.length === 0 && !pickerOpen && <p className="text-[12.5px] text-fg-muted">No commodities on file yet.</p>}
        {commodities.map((label) => {
          const busy = busyValue === label;
          return (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-inset py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-fg"
            >
              {label}
              <button
                type="button"
                onClick={() => remove(label)}
                disabled={pending}
                aria-label={`Remove ${label}`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-50"
              >
                {busy ? "…" : <IconX width={9} height={9} />}
              </button>
            </span>
          );
        })}
        {fromAi && commodities.length > 0 && (
          <span
            title="Confirmed from AI research"
            className="inline-flex items-center gap-0.5 bg-warn-bg px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn"
          >
            <IconAiAgent width={9} height={9} />
            AI
          </span>
        )}
      </div>

      {pickerOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line-strong bg-inset/60 p-3">
          {availablePresets.map((label) => {
            const busy = busyValue === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => addPreset(label)}
                disabled={pending}
                className={`${PILL} ${PILL_SIZE} disabled:opacity-60 ${PILL_INACTIVE}`}
              >
                {busy ? "…" : label}
              </button>
            );
          })}

          {adding ? (
            <div className={`flex items-center gap-1.5 rounded-full border border-fg-subtle bg-card pl-3 pr-1.5 ${PILL_SIZE}`}>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  } else if (e.key === "Escape") {
                    setCustomText("");
                    setAdding(false);
                  }
                }}
                autoFocus
                placeholder="…or type your own"
                className="h-full w-36 min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-medium text-fg outline-none"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customText.trim()}
                className="flex h-full shrink-0 items-center rounded-full bg-accent px-2.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className={`${PILL} ${PILL_SIZE} gap-1 ${PILL_DASHED}`}>
              <IconPlus width={13} height={13} />
              …or type your own
            </button>
          )}
        </div>
      )}
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}
