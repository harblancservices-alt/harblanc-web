"use client";

/**
 * Backhaul Reach — Setup. The from-name / truck-line / contact config, pulled
 * out of the main Send flow behind a small "Setup" button. One save writes the
 * singleton reach_settings row. Truck line + from name are lifted into the Send
 * tab so the live email updates as you type here.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { field } from "@/components/ui/styles";
import { updateReachSettings } from "./actions";
import {
  LEVERAGES,
  STYLE_BLURB,
  STYLE_LABEL,
  type Leverage,
  type ReachSettings,
} from "./types";

export function SetupModal({
  settings,
  truckLine,
  onTruckLineChange,
  replyToName,
  onReplyToNameChange,
  mc,
  onMcChange,
  phone,
  onPhoneChange,
  onSaved,
  onClose,
}: {
  settings: ReachSettings;
  truckLine: string;
  onTruckLineChange: (v: string) => void;
  replyToName: string;
  onReplyToNameChange: (v: string) => void;
  mc: string;
  onMcChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [showExactTown, setShowExactTown] = useState(settings.showExactTown);
  const [defaultStyle, setDefaultStyle] = useState<Leverage>(
    settings.defaultLeverage,
  );
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await updateReachSettings({
        truckLine,
        replyToName,
        showExactTown,
        defaultLeverage: defaultStyle,
        mc,
        phone,
      });
      if (res.ok) {
        setFlash({ ok: true, text: "Saved" });
        onSaved();
      } else {
        setFlash({ ok: false, text: res.reason });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reach setup"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="my-4 w-full max-w-md overflow-hidden rounded-lg border border-line-strong bg-card shadow-e3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5">
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-bar-fg">
            Setup
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-sm border border-white/25 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bar-fg transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <label className={field.label}>From name</label>
            <input
              value={replyToName}
              onChange={(e) => onReplyToNameChange(e.target.value)}
              className={field.input}
              placeholder="HARBLANC"
            />
            <p className="mt-1 text-[11px] text-fg-subtle">
              The sender name brokers see, and on replies. Not the subject line.
            </p>
          </div>

          <div>
            <label className={field.label}>Truck line</label>
            <input
              value={truckLine}
              onChange={(e) => onTruckLineChange(e.target.value)}
              className={field.input}
              placeholder="40' gooseneck hotshot, dually"
            />
            <p className="mt-1 text-[11px] text-fg-subtle">
              Your equipment, dropped into the email wherever it fits.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={field.label}>MC number</label>
              <input
                value={mc}
                onChange={(e) => onMcChange(e.target.value)}
                className={field.input}
                placeholder="1467901"
              />
            </div>
            <div>
              <label className={field.label}>Phone</label>
              <input
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                className={field.input}
                placeholder="832-445-8775"
                inputMode="tel"
              />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-fg-subtle">
            Shown in every email&apos;s signature.
          </p>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-inset px-3 py-2.5">
            <input
              type="checkbox"
              checked={showExactTown}
              onChange={(e) => setShowExactTown(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-fg">
                Show exact town + distance
              </span>
              <span className="block text-[11.5px] text-fg-muted">
                Adds “(Kingwood, 22 mi NE)” after the market. Off = market name
                only.
              </span>
            </span>
          </label>

          <div>
            <label className={field.label}>Default style</label>
            <select
              value={defaultStyle}
              onChange={(e) => setDefaultStyle(e.target.value as Leverage)}
              className={field.select}
            >
              {LEVERAGES.map((l) => (
                <option key={l} value={l}>
                  {STYLE_LABEL[l]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-fg-subtle">
              {STYLE_BLURB[defaultStyle]}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line bg-elevated px-4 py-3">
          {flash ? (
            <span
              className={
                "mr-auto text-[12px] " + (flash.ok ? "text-ok" : "text-bad")
              }
            >
              {flash.text}
            </span>
          ) : null}
          <Button variant="cancel" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="primary" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save setup"}
          </Button>
        </div>
      </div>
    </div>
  );
}
