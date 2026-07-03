"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { field } from "@/components/ui/styles";
import {
  ensureReachTemplate,
  updateReachSettings,
  updateReachTemplate,
} from "./actions";
import {
  LEVERAGES,
  LEVERAGE_LABEL,
  POSTURES,
  POSTURE_LABEL,
  type Leverage,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

type Flash = { ok: boolean; text: string } | null;

// Markets are BUILT-IN (see ./markets) — there is no market-management UI.
// Brent never creates markets, types cities, or sets radii.
export function ReachSettingsPanel({
  settings,
  templates,
  templatesAvailable,
  truckLine,
  onTruckLineChange,
  replyToName,
  onReplyToNameChange,
  onSaved,
}: {
  settings: ReachSettings;
  templates: ReachTemplate[];
  templatesAvailable: boolean;
  /** Lifted so the Reach preview's {equipment} updates live as he types. */
  truckLine: string;
  onTruckLineChange: (v: string) => void;
  /** Lifted so the send uses the current sender/reply display name. */
  replyToName: string;
  onReplyToNameChange: (v: string) => void;
  /** Called after a successful save so the parent can refresh server data. */
  onSaved: () => void;
}) {
  return (
    <div className="space-y-4">
      <GeneralSettings
        settings={settings}
        truckLine={truckLine}
        onTruckLineChange={onTruckLineChange}
        replyToName={replyToName}
        onReplyToNameChange={onReplyToNameChange}
        onSaved={onSaved}
      />
      <TemplatesEditor templates={templates} available={templatesAvailable} />
    </div>
  );
}

// ── General ──────────────────────────────────────────────────────────────────

function GeneralSettings({
  settings,
  truckLine,
  onTruckLineChange,
  replyToName,
  onReplyToNameChange,
  onSaved,
}: {
  settings: ReachSettings;
  truckLine: string;
  onTruckLineChange: (v: string) => void;
  replyToName: string;
  onReplyToNameChange: (v: string) => void;
  onSaved: () => void;
}) {
  const [showExactTown, setShowExactTown] = useState(settings.showExactTown);
  const [defaultLeverage, setDefaultLeverage] = useState<Leverage>(
    settings.defaultLeverage,
  );
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await updateReachSettings({
        truckLine,
        replyToName,
        showExactTown,
        defaultLeverage,
      });
      setFlash(
        res.ok
          ? { ok: true, text: "Saved" }
          : { ok: false, text: res.reason },
      );
      if (res.ok) onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
        General
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className={field.label}>Truck line</label>
          <input
            value={truckLine}
            onChange={(e) => onTruckLineChange(e.target.value)}
            className={field.input}
            placeholder="40' gooseneck hotshot, dually"
          />
        </div>
        <div>
          <label className={field.label}>From name</label>
          <input
            value={replyToName}
            onChange={(e) => onReplyToNameChange(e.target.value)}
            className={field.input}
            placeholder="HARBLANC"
          />
          <p className="mt-1 text-[11px] text-fg-subtle">
            Sender name brokers see + on replies. Not the subject.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={showExactTown}
            onChange={(e) => setShowExactTown(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-[13px] text-fg">Show exact town + distance</span>
        </label>
        <div>
          <label className={field.label}>Default leverage</label>
          <select
            value={defaultLeverage}
            onChange={(e) => setDefaultLeverage(e.target.value as Leverage)}
            className={field.select}
          >
            {LEVERAGES.map((l) => (
              <option key={l} value={l}>
                {LEVERAGE_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {flash ? (
          <span
            className={
              "text-[11px] " + (flash.ok ? "text-ok" : "text-bad")
            }
          >
            {flash.text}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

// ── Templates ────────────────────────────────────────────────────────────────

function TemplatesEditor({
  templates,
  available,
}: {
  templates: ReachTemplate[];
  available: boolean;
}) {
  const byKey = new Map<string, ReachTemplate>();
  for (const t of templates) byKey.set(`${t.posture}-${t.leverage}`, t);

  return (
    <Card>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
        Templates
      </p>
      {!available ? (
        <p className="mt-2 font-mono text-[10px] text-warn">
          Needs the reach_* migration.
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-fg-subtle">
        {"{broker}"} · {"{market}"} · {"{equipment}"} · {"{town_paren}"}
      </p>
      <div className="mt-3 space-y-2">
        {POSTURES.map((posture) =>
          LEVERAGES.map((leverage) => {
            const key = `${posture}-${leverage}`;
            const t = byKey.get(key);
            return (
              <TemplateRow
                key={key}
                posture={posture}
                leverage={leverage}
                template={t ?? null}
                disabled={!available}
              />
            );
          }),
        )}
      </div>
    </Card>
  );
}

function TemplateRow({
  posture,
  leverage,
  template,
  disabled,
}: {
  posture: (typeof POSTURES)[number];
  leverage: Leverage;
  template: ReachTemplate | null;
  disabled: boolean;
}) {
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      // The seed creates all six, but ensure the row exists in case one was
      // deleted or the seed ran on a subset.
      let id = template?.id ?? "";
      if (!id) {
        const ens = await ensureReachTemplate(posture, leverage);
        if (!ens.ok) {
          setFlash({ ok: false, text: ens.reason });
          return;
        }
        id = ens.id;
      }
      const res = await updateReachTemplate(id, { subject, body });
      setFlash(
        res.ok ? { ok: true, text: "Saved" } : { ok: false, text: res.reason },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-inset p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[13px] font-semibold text-fg">
          {POSTURE_LABEL[posture]} · {LEVERAGE_LABEL[leverage]}
        </span>
        <span className="font-mono text-[11px] text-ink-3">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2.5">
          <div>
            <label className={field.label}>Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={field.input}
              disabled={disabled}
            />
          </div>
          <div>
            <label className={field.label}>Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className={field.textarea}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={onSave}
              disabled={busy || disabled}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
            {flash ? (
              <span
                className={
                  "text-[11px] " + (flash.ok ? "text-ok" : "text-bad")
                }
              >
                {flash.text}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
