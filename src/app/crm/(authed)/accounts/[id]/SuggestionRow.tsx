"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN_SUCCESS, BTN_EDIT, BTN_DANGER, BTN_NEUTRAL } from "../../_shell/ui";
import { CONTROL } from "../../_shell/form";
import { IconCheck, IconX } from "../../_shell/icons";
import { DETAILS_FIELD_BY_KEY, formatFieldValue } from "./details-fields";
import { confirmSuggestion, editAndConfirmSuggestion, dismissSuggestion } from "./ai-suggestions-actions";
import type { AiSuggestion } from "./ai-suggestions";

/**
 * One pending AI suggestion — Confirm / Edit / Dismiss. When the field
 * already carries a manual value, that value renders alongside the
 * suggestion so the rep can see exactly what confirming would overwrite
 * ("show both side-by-side and let the rep choose", per spec).
 */
export function SuggestionRow({ suggestion, currentValue }: { suggestion: AiSuggestion; currentValue: unknown }) {
  const def = DETAILS_FIELD_BY_KEY.get(suggestion.fieldKey);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(def ? formatFieldValue(def, suggestion.suggestedValue) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!def) return null;

  const suggestedText = formatFieldValue(def, suggestion.suggestedValue);
  const currentText = formatFieldValue(def, currentValue);
  const hasManualValue = currentText.trim().length > 0;

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await confirmSuggestion(suggestion.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }
  function onSaveEdit() {
    setError(null);
    startTransition(async () => {
      const res = await editAndConfirmSuggestion(suggestion.id, editText);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }
  function onDismiss() {
    setError(null);
    startTransition(async () => {
      const res = await dismissSuggestion(suggestion.id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{def.label}</p>
      </div>

      {editing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          rows={2}
          autoFocus
          className={`w-full min-w-0 resize-y py-2 leading-relaxed ${CONTROL}`}
        />
      ) : (
        <div className={`grid gap-3 ${hasManualValue ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
          {hasManualValue && (
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle">Current</p>
              <p className="mt-0.5 break-words text-[13.5px] text-fg-muted">{currentText}</p>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-warn">AI suggests</p>
            <p className="mt-0.5 break-words text-[13.5px] text-fg">{suggestedText || "—"}</p>
          </div>
        </div>
      )}

      {error && <p className="text-[12px] text-bad">{error}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {editing ? (
          <>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={pending}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_SUCCESS}`}
            >
              <IconCheck width={13} height={13} />
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_NEUTRAL}`}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_SUCCESS}`}
            >
              <IconCheck width={13} height={13} />
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className={`inline-flex h-8 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_EDIT}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={pending}
              className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold transition-colors ${BTN_DANGER}`}
            >
              <IconX width={13} height={13} />
              Dismiss
            </button>
          </>
        )}
      </div>
    </li>
  );
}
