"use client";

import { useEffect, useRef, useState } from "react";
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
        Truck
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className={field.label}>Truck line</label>
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

// ── Markets ──────────────────────────────────────────────────────────────────

type CityHit = {
  city: string;
  state: string;
  zip: string;
  lat: number;
  lon: number;
};

/** A picked city becomes the market: "Houston, TX area". */
function marketNameFor(c: CityHit): string {
  return `${c.city}, ${c.state} area`;
}

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
          {adding ? "Close" : "+ Add"}
        </Button>
      </div>
      {!available ? (
        <p className="mt-2 font-mono text-[10px] text-warn">
          Needs the reach_* migration.
        </p>
      ) : null}

      {adding ? (
        <div className="mt-3">
          <MarketRow isNew onDone={() => setAdding(false)} />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {markets.map((m) => (
          <MarketRow
            key={m.id}
            id={m.id}
            name={m.name}
            centerZip={m.centerZip ?? ""}
            radiusMi={m.radiusMi}
          />
        ))}
      </div>
    </Card>
  );
}

function MarketRow({
  id,
  name,
  centerZip,
  radiusMi,
  isNew,
  onDone,
}: {
  id?: string;
  name?: string;
  centerZip?: string;
  radiusMi?: number;
  isNew?: boolean;
  onDone?: () => void;
}) {
  // A newly-picked city overrides the market's name + center. Left null on an
  // existing market until he changes it.
  const [city, setCity] = useState<CityHit | null>(null);
  const [radius, setRadius] = useState(String(radiusMi ?? 150));
  const [open, setOpen] = useState(!!isNew);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  async function onSave() {
    if (busy) return;
    // New markets need a city; existing ones keep theirs unless he picks a new.
    const marketName = city ? marketNameFor(city) : (name ?? "");
    const zip = city ? city.zip : (centerZip ?? "");
    if (!marketName || !zip) {
      setFlash({ ok: false, text: "Pick a city." });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const input = {
        name: marketName,
        wording: marketName,
        centerZip: zip,
        radiusMi: Number(radius) || 150,
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
    if (!window.confirm(`Delete "${name}"?`)) return;
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
          <span className="text-[13px] font-semibold text-fg">{name}</span>
          <span className="font-mono text-[11px] text-ink-3">
            {radius} mi {open ? "▲" : "▼"}
          </span>
        </button>
      ) : null}

      {open ? (
        <div className={isNew ? "space-y-2.5" : "mt-3 space-y-2.5"}>
          <CityPicker value={city} onChange={setCity} currentName={name} />
          <div className="w-28">
            <label className={field.label}>Radius (mi)</label>
            <input
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              inputMode="numeric"
              className={field.input}
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
                className={"text-[11px] " + (flash.ok ? "text-ok" : "text-bad")}
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

/**
 * City typeahead over the bundled zipcodes dataset (same source as the
 * farm-contact form). He types a city, picks one, and its coordinates + name
 * flow into the market — no manual ZIPs, coordinates, or wording.
 */
function CityPicker({
  value,
  onChange,
  currentName,
}: {
  value: CityHit | null;
  onChange: (v: CityHit | null) => void;
  currentName?: string;
}) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<CityHit[]>([]);
  const [openList, setOpenList] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (value) return;
    const q = text.trim();
    const id = ++reqRef.current;
    // All state updates happen inside the debounce (async), never synchronously
    // in the effect body.
    const t = setTimeout(() => {
      if (id !== reqRef.current) return;
      if (q.length < 2) {
        setHits([]);
        setOpenList(false);
        return;
      }
      fetch(`/api/admin/dispatch/cities?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => {
          if (id !== reqRef.current) return;
          setHits(j.cities ?? []);
          setOpenList(true);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [text, value]);

  return (
    <div className="relative">
      <label className={field.label}>City</label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-line-strong bg-card px-3 py-2">
          <span className="truncate text-[13px] font-semibold text-ink">
            {value.city}, {value.state}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setText("");
            }}
            className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-steel hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => hits.length > 0 && setOpenList(true)}
            autoComplete="off"
            placeholder={currentName || "Type a city…"}
            className={field.input}
          />
          {openList && hits.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line-strong bg-card shadow-e2">
              {hits.map((h) => (
                <li key={`${h.zip}-${h.city}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(h);
                      setOpenList(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-inset"
                  >
                    <span className="truncate">
                      {h.city}, {h.state}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {h.zip}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
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
