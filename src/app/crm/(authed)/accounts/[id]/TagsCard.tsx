"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus, IconTag, IconX } from "../../_shell/icons";
import { PILL, PILL_SIZE, PILL_INACTIVE, PILL_DASHED } from "../../_shell/compactForm";
import { attachTag, createTag, detachTag } from "../actions";

export type CrmTagOption = { id: string; label: string; color: string | null };

/** Sales-rep-POV presets for a logistics company — relationship/commercial
 * signals, deliberately NOT equipment (that's the Freight profile group's
 * own pill picker). */
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
 * A subsection of the merged "Company Details" card. 2026-08-12 relayout:
 * the full ten-preset picker used to render inline at all times (a wall of
 * pills regardless of how many were actually attached) — now only the
 * ACCOUNT's attached tags show by default, each a small removable chip, and
 * the preset/custom picker stays collapsed behind a "+ Add tag" toggle so it
 * never crowds the card. Presets are lazily materialized as real crm_tags
 * rows on first use (attachTag if the org already has one with that label
 * from any company, createTag — which attaches in the same call — if not),
 * so this still rides the existing tag infrastructure/actions, just a
 * different picker on top of it. Owns no Card/CardHead of its own — the
 * parent card supplies the outer chrome.
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [customText, setCustomText] = useState("");
  const router = useRouter();

  const attachedIds = new Set(attached.map((t) => t.id));
  const orgTagByLabel = new Map(orgTags.map((t) => [t.label.toLowerCase(), t]));
  const availablePresets = TAG_PRESETS.filter((label) => {
    const existing = orgTagByLabel.get(label.toLowerCase());
    return !existing || !attachedIds.has(existing.id);
  });

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

  function addPreset(label: string, index: number) {
    if (pending) return;
    setError(null);
    const existing = orgTagByLabel.get(label.toLowerCase());
    setBusyKey(label);
    startTransition(async () => {
      const res = existing ? await attachTag(accountId, existing.id) : await createTag(accountId, label, PRESET_COLORS[index % PRESET_COLORS.length]);
      setBusyKey(null);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function detach(tag: CrmTagOption) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warn/10 text-warn">
            <IconTag width={12} height={12} />
          </span>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg">Tags</h3>
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
              Add tag
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {attached.length === 0 && !pickerOpen && <p className="text-[12.5px] text-fg-muted">No tags yet.</p>}
        {attached.map((tag) => {
          const busy = busyKey === tag.id;
          return (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-inset py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-fg"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tag.color || "var(--fg-subtle)" }} />
              {tag.label}
              <button
                type="button"
                onClick={() => detach(tag)}
                disabled={pending}
                aria-label={`Remove ${tag.label}`}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bad/10 hover:text-bad disabled:opacity-50"
              >
                {busy ? "…" : <IconX width={9} height={9} />}
              </button>
            </span>
          );
        })}
      </div>

      {pickerOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line-strong bg-inset/60 p-3">
          {availablePresets.map((label) => {
            const index = TAG_PRESETS.indexOf(label);
            const busy = busyKey === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => addPreset(label, index)}
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
                placeholder="Custom tag…"
                className="h-full w-28 min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-medium text-fg outline-none"
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
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={`${PILL} ${PILL_SIZE} gap-1 ${PILL_DASHED}`}
            >
              <IconPlus width={13} height={13} />
              Custom
            </button>
          )}
        </div>
      )}
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}
