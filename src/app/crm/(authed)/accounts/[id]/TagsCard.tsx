"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "../../_shell/icons";
import { attachTag, createTag, detachTag } from "../actions";

export type CrmTagOption = { id: string; label: string; color: string | null };

/** Sales-rep-POV presets for a logistics company — relationship/commercial
 * signals, deliberately NOT equipment (that's the Freight profile group's
 * own pill picker). Colors are just the dot shown elsewhere a tag renders
 * (Companies list chip, etc.) — this widget's own selected/unselected
 * treatment is uniform green/outline, matching the Equipment/Special
 * requirements and contact-role pills. */
const TAG_PRESETS = [
  "Hot Lead",
  "Key Account",
  "High Volume",
  "Consistent Freight",
  "Seasonal",
  "Price Sensitive",
  "Reliable Payer",
  "Slow Pay",
  "Contract",
  "Spot Market",
] as const;
const PRESET_COLORS = ["#dc2626", "#7c3aed", "#2563eb", "#16a34a", "#d97706", "#64748b"];
const CUSTOM_COLOR = "#64748b";

/**
 * A subsection of the merged "Company Details" card — tappable tag pills:
 * ten sales-rep-POV presets plus any already-attached tag outside that list
 * (a legacy/custom one), all through the same tap-to-select-green/tap-again-
 * to-deselect interaction as the Freight profile and contact-role pills
 * (2026-08-09). Presets are lazily materialized as real crm_tags rows on
 * first use (attachTag if the org already has one with that label from any
 * company, createTag — which attaches in the same call — if not), so this
 * still rides the existing tag infrastructure/actions, just a different
 * picker on top of it. "+ Add" swaps in a small inline input for anything
 * not on the preset list, same pattern as the Freight profile pills' custom
 * entry. Owns no Card/CardHead of its own — the parent card supplies the
 * outer chrome.
 */
export function TagsCard({
  accountId,
  attached,
  orgTags,
}: {
  accountId: string;
  attached: CrmTagOption[];
  orgTags: CrmTagOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customText, setCustomText] = useState("");
  const router = useRouter();

  const attachedIds = new Set(attached.map((t) => t.id));
  const orgTagByLabel = new Map(orgTags.map((t) => [t.label.toLowerCase(), t]));
  const extras = attached.filter((t) => !TAG_PRESETS.some((p) => p.toLowerCase() === t.label.toLowerCase()));

  function togglePreset(label: string, index: number) {
    if (pending) return;
    setError(null);
    const existing = orgTagByLabel.get(label.toLowerCase());
    const isAttached = !!existing && attachedIds.has(existing.id);
    setBusyKey(label);
    startTransition(async () => {
      const res = isAttached && existing
        ? await detachTag(accountId, existing.id)
        : existing
          ? await attachTag(accountId, existing.id)
          : await createTag(accountId, label, PRESET_COLORS[index % PRESET_COLORS.length]);
      setBusyKey(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function toggleExtra(tag: CrmTagOption) {
    if (pending) return;
    setError(null);
    setBusyKey(tag.id);
    startTransition(async () => {
      const res = await detachTag(accountId, tag.id);
      setBusyKey(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function addCustom() {
    const label = customText.trim();
    if (!label) return;
    setError(null);
    setAdding(false);
    setCustomText("");
    startTransition(async () => {
      const res = await createTag(accountId, label, CUSTOM_COLOR);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const pillBase = "flex min-h-11 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60";
  const selectedCls = "border border-ok bg-ok text-white hover:bg-ok/90";
  const unselectedCls = "border border-fg-subtle bg-card text-fg hover:bg-inset";

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">Tags</h3>
      <div className="flex flex-wrap gap-2">
        {TAG_PRESETS.map((label, i) => {
          const existing = orgTagByLabel.get(label.toLowerCase());
          const active = !!existing && attachedIds.has(existing.id);
          const busy = busyKey === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => togglePreset(label, i)}
              disabled={pending}
              aria-pressed={active}
              className={`${pillBase} ${active ? selectedCls : unselectedCls}`}
            >
              {busy ? "…" : label}
            </button>
          );
        })}

        {extras.map((tag) => {
          const busy = busyKey === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleExtra(tag)}
              disabled={pending}
              aria-pressed
              className={`${pillBase} ${selectedCls}`}
            >
              {busy ? "…" : tag.label}
            </button>
          );
        })}

        {adding ? (
          <div className="flex min-h-11 items-center gap-1.5 rounded-full border border-fg-subtle bg-card pl-3.5 pr-1.5">
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
              placeholder="Custom tag…"
              className="h-8 w-32 min-w-0 border-0 bg-transparent p-0 text-[13px] font-medium text-fg outline-none"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!customText.trim()}
              className="flex h-8 shrink-0 items-center rounded-full bg-accent px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-fg-subtle bg-card px-3.5 text-[13px] font-semibold text-fg-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            <IconPlus width={13} height={13} />
            Add
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}
