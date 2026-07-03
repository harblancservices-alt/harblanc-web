"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { field } from "@/components/ui/styles";
import {
  createReachMarket,
  deleteReachMarket,
  ensureReachTemplate,
  updateReachMarket,
  updateReachSettings,
  updateReachTemplate,
} from "./actions";
import {
  LEVERAGES,
  LEVERAGE_LABEL,
  POSTURES,
  POSTURE_LABEL,
  type Leverage,
  type ReachMarket,
  type ReachSettings,
  type ReachTemplate,
} from "./types";

type Flash = { ok: boolean; text: string } | null;

export function ReachSettingsPanel({
  settings,
  markets,
  templates,
  marketsAvailable,
  templatesAvailable,
}: {
  settings: ReachSettings;
  markets: ReachMarket[];
  templates: ReachTemplate[];
  marketsAvailable: boolean;
  templatesAvailable: boolean;
}) {
  return (
    <div className="space-y-4">
      <GeneralSettings settings={settings} />
      <MarketsEditor markets={markets} available={marketsAvailable} />
      <TemplatesEditor templates={templates} available={templatesAvailable} />
    </div>
  );
}

// ── General ──────────────────────────────────────────────────────────────────

function GeneralSettings({ settings }: { settings: ReachSettings }) {
  const [truckLine, setTruckLine] = useState(settings.truckLine);
  const [replyToName, setReplyToName] = useState(settings.replyToName);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
        Truck & wording
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className={field.label}>Truck line ({"{equipment}"})</label>
          <input
            value={truckLine}
            onChange={(e) => setTruckLine(e.target.value)}
            className={field.input}
            placeholder="40' gooseneck hotshot, dually"
          />
        </div>
        <div>
          <label className={field.label}>Reply-to name</label>
          <input
            value={replyToName}
            onChange={(e) => setReplyToName(e.target.value)}
            className={field.input}
            placeholder="HARBLANC"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={showExactTown}
            onChange={(e) => setShowExactTown(e.target.checked)}
            className="accent-accent"
          />
          <span className="text-[13px] text-fg">
            Show exact town + distance{" "}
            <span className="text-fg-subtle">
              — “{"{market}"} (Kingwood, 22 mi NE)”
            </span>
          </span>
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
          {busy ? "Saving…" : "Save settings"}
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

// ── Markets ──────────────────────────────────────────────────────────────────

type MarketDraft = {
  name: string;
  wording: string;
  centerZip: string;
  radiusMi: string;
  towns: string;
  notes: string;
};

function marketToDraft(m: ReachMarket): MarketDraft {
  return {
    name: m.name,
    wording: m.wording,
    centerZip: m.centerZip ?? "",
    radiusMi: String(m.radiusMi),
    towns: m.towns ?? "",
    notes: m.notes ?? "",
  };
}

const EMPTY_DRAFT: MarketDraft = {
  name: "",
  wording: "",
  centerZip: "",
  radiusMi: "150",
  towns: "",
  notes: "",
};

function MarketsEditor({
  markets,
  available,
}: {
  markets: ReachMarket[];
  available: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">
          Markets · {markets.length}
        </p>
        <Button
          size="sm"
          variant="navigate"
          onClick={() => setAdding((v) => !v)}
          disabled={!available}
        >
          {adding ? "Close" : "+ Add market"}
        </Button>
      </div>
      {!available ? (
        <p className="mt-2 font-mono text-[10px] text-warn">
          Markets need the reach_* migration applied.
        </p>
      ) : null}

      {adding ? (
        <div className="mt-3">
          <MarketRow draft={EMPTY_DRAFT} onDone={() => setAdding(false)} isNew />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {markets.map((m) => (
          <MarketRow key={m.id} id={m.id} draft={marketToDraft(m)} />
        ))}
      </div>
    </Card>
  );
}

function MarketRow({
  id,
  draft: initial,
  isNew,
  onDone,
}: {
  id?: string;
  draft: MarketDraft;
  isNew?: boolean;
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState<MarketDraft>(initial);
  const [open, setOpen] = useState(!!isNew);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  function set<K extends keyof MarketDraft>(k: K, v: MarketDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function onSave() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const input = {
        name: draft.name,
        wording: draft.wording,
        centerZip: draft.centerZip,
        radiusMi: Number(draft.radiusMi) || 150,
        towns: draft.towns,
        notes: draft.notes,
      };
      const res = id
        ? await updateReachMarket(id, input)
        : await createReachMarket(input);
      if (!res.ok) {
        setFlash({ ok: false, text: res.reason });
        return;
      }
      setFlash({ ok: true, text: "Saved" });
      if (isNew) onDone?.();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!id || busy) return;
    if (!window.confirm(`Delete the "${draft.name}" market?`)) return;
    setBusy(true);
    try {
      await deleteReachMarket(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-inset p-3">
      {!isNew ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[13px] font-semibold text-fg">
            {draft.name || "Untitled market"}
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            {draft.centerZip || "—"} · {draft.radiusMi} mi {open ? "▲" : "▼"}
          </span>
        </button>
      ) : (
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">
          New market
        </p>
      )}

      {open ? (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className={field.label}>Name</label>
              <input
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                className={field.input}
                placeholder="Houston, TX area"
              />
            </div>
            <div>
              <label className={field.label}>Wording ({"{market}"})</label>
              <input
                value={draft.wording}
                onChange={(e) => set("wording", e.target.value)}
                className={field.input}
                placeholder="the Houston market"
              />
            </div>
            <div>
              <label className={field.label}>Center ZIP</label>
              <input
                value={draft.centerZip}
                onChange={(e) => set("centerZip", e.target.value)}
                inputMode="numeric"
                className={field.input}
                placeholder="77002"
              />
            </div>
            <div>
              <label className={field.label}>Radius (mi)</label>
              <input
                value={draft.radiusMi}
                onChange={(e) => set("radiusMi", e.target.value)}
                inputMode="numeric"
                className={field.input}
                placeholder="150"
              />
            </div>
          </div>
          <div>
            <label className={field.label}>Towns it covers</label>
            <input
              value={draft.towns}
              onChange={(e) => set("towns", e.target.value)}
              className={field.input}
              placeholder="Kingwood, Conroe, Baytown…"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={onSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {id ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={onDelete}
                disabled={busy}
              >
                Delete
              </Button>
            ) : null}
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
        Templates · posture × leverage
      </p>
      {!available ? (
        <p className="mt-2 font-mono text-[10px] text-warn">
          Templates need the reach_* migration applied.
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-fg-subtle">
        Tokens — {"{broker}"} · {"{market}"} · {"{equipment}"} ·{" "}
        {"{town_paren}"}
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
