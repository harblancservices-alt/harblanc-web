"use client";

import { useEffect, useState } from "react";

/**
 * Display preferences — Orientation + UI Scale. Persist to localStorage
 * ('harblanc-orientation' / 'harblanc-ui-scale') and apply live to <html>
 * (data-layout attribute + --admin-ui-scale var), mirroring the theme toggle.
 * The inline script in the admin layout re-applies both on every load (no
 * flash / no layout jump). Visual-only — no data or workflow changes.
 *
 *   Orientation  auto      → follows viewport width (current behavior)
 *                portrait  → force the narrow/mobile layout at any width
 *                landscape → force the desktop layout at any width
 *   UI Scale     90/100/110/125/150% → zoom the whole admin shell
 */

type Orientation = "auto" | "portrait" | "landscape";
const ORIENTATIONS: readonly { value: Orientation; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "portrait", label: "Portrait" },
  { value: "landscape", label: "Landscape" },
];

const SCALES = [90, 100, 110, 125, 150] as const;
type Scale = (typeof SCALES)[number];

function applyOrientation(v: Orientation) {
  const d = document.documentElement;
  if (v === "portrait" || v === "landscape") d.setAttribute("data-layout", v);
  else d.removeAttribute("data-layout");
}

function applyScale(pct: number) {
  document.documentElement.style.setProperty(
    "--admin-ui-scale",
    (pct / 100).toString(),
  );
}

const SEG =
  "inline-flex rounded-md border border-line-strong bg-inset p-0.5";
function segBtn(active: boolean): string {
  return (
    "rounded px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors " +
    (active
      ? "bg-graphite text-white shadow-e1"
      : "text-ink-2 hover:text-ink")
  );
}

export function DisplaySettings() {
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [scale, setScale] = useState<Scale>(100);

  // Sync the control's highlight to the saved prefs on mount (the inline script
  // in the layout already applied them to the DOM). Defaults render on the
  // server + first client paint, so this is hydration-safe; the mount read of
  // an external store (localStorage) into state is a legitimate effect use.
  useEffect(() => {
    try {
      const o = localStorage.getItem("harblanc-orientation");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external-store sync on mount
      if (o === "portrait" || o === "landscape") setOrientation(o);
      const s = parseInt(localStorage.getItem("harblanc-ui-scale") ?? "", 10);
      if (SCALES.includes(s as Scale)) setScale(s as Scale);
    } catch {
      /* ignore */
    }
  }, []);

  function pickOrientation(v: Orientation) {
    setOrientation(v);
    try {
      localStorage.setItem("harblanc-orientation", v);
    } catch {
      /* ignore */
    }
    applyOrientation(v);
  }

  function pickScale(v: Scale) {
    setScale(v);
    try {
      localStorage.setItem("harblanc-ui-scale", String(v));
    } catch {
      /* ignore */
    }
    applyScale(v);
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Orientation
        </p>
        <div className={"mt-2 " + SEG}>
          {ORIENTATIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pickOrientation(o.value)}
              aria-pressed={orientation === o.value}
              className={segBtn(orientation === o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-2">
          Portrait forces the single-column mobile layout so content fills a
          tall screen.
        </p>
      </div>

      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">
          UI scale
        </p>
        <div className={"mt-2 " + SEG}>
          {SCALES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickScale(s)}
              aria-pressed={scale === s}
              className={segBtn(scale === s)}
            >
              {s}%
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-2">
          Scale the whole admin UI up or down.
        </p>
      </div>
    </div>
  );
}
