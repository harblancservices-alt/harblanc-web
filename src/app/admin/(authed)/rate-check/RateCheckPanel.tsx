"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { computeRpm } from "@/lib/dispatch/rpm";
import {
  analyzeRateScreenshot,
  estimateMilesForZips,
  saveCostSettings,
} from "./actions";
import type { CostSettings, ExtractedLoad, VerdictTier } from "./types";

/**
 * Rate Check panel (client).
 *
 * Flow:
 *   1. Brent pastes a load-posting screenshot (Win+Shift+S → Ctrl+V),
 *      picks an image file, or snaps a photo on his phone.
 *   2. The image is downscaled client-side (≤1600px, JPEG q0.8) so it stays
 *      well under the server-action body limit and cuts vision-API cost.
 *   3. The small image goes to the analyzeRateScreenshot server action,
 *      which calls Claude vision and returns structured load fields.
 *   4. Fields land in an EDITABLE form (Brent corrects anything misread).
 *   5. RPM = rate ÷ miles; verdict compares RPM to cost-per-mile.
 *
 * Degrades gracefully: with no ANTHROPIC_API_KEY the action returns a
 * friendly setup message and the form opens empty for manual entry, so the
 * verdict still works today.
 */

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.8;

type FormState = {
  originCity: string;
  destCity: string;
  originZip: string;
  destZip: string;
  miles: string;
  rate: string;
  equipment: string;
  weight: string;
  broker: string;
  contact: string;
  pickupDate: string;
  deliveryDate: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  originCity: "",
  destCity: "",
  originZip: "",
  destZip: "",
  miles: "",
  rate: "",
  equipment: "",
  weight: "",
  broker: "",
  contact: "",
  pickupDate: "",
  deliveryDate: "",
  notes: "",
};

function loadToForm(load: ExtractedLoad, computedMiles: number | null): FormState {
  const miles = load.trip_miles ?? computedMiles;
  return {
    originCity: load.origin ?? "",
    destCity: load.destination ?? "",
    originZip: load.origin_zip ?? "",
    destZip: load.dest_zip ?? "",
    miles: miles != null ? String(miles) : "",
    rate: load.rate_total != null ? String(load.rate_total) : "",
    equipment: load.equipment ?? "",
    weight: load.weight ?? "",
    broker: load.broker ?? "",
    contact: load.contact ?? "",
    pickupDate: load.pickup_date ?? "",
    deliveryDate: load.delivery_date ?? "",
    notes: load.notes ?? "",
  };
}

function parseNum(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function verdictFor(
  rpm: number | null,
  cpm: number | null,
  marginPct: number,
): VerdictTier | null {
  if (rpm == null || cpm == null || cpm <= 0) return null;
  const target = cpm * (1 + marginPct / 100);
  if (rpm < cpm) return "pass";
  if (rpm < target) return "marginal";
  return "take";
}

function money(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** Downscale any image blob to ≤MAX_DIM and re-encode as JPEG. */
function downscaleImage(
  file: Blob,
): Promise<{ base64: string; mediaType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (!width || !height) {
        reject(new Error("That file isn't a readable image."));
        return;
      }
      const scale = Math.min(1, MAX_DIM / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Couldn't process the image in this browser."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ base64, mediaType: "image/jpeg", previewUrl: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a readable image."));
    };
    img.src = url;
  });
}

const labelCls =
  "font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fg/70";
const inputCls =
  "mt-1 block w-full border-2 border-line bg-card px-3 py-2 text-[15px] text-fg focus:border-fg focus:outline-none";

export function RateCheckPanel({ cost }: { cost: CostSettings }) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [milesWereComputed, setMilesWereComputed] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Cost basis — seeded from server, editable + savable inline. Kept in local
  // state so the verdict updates the instant Brent saves (optimistic).
  const [cpm, setCpm] = useState(
    cost.costPerMile != null ? String(cost.costPerMile) : "",
  );
  const [margin, setMargin] = useState(
    cost.targetMarginPct != null ? String(cost.targetMarginPct) : "",
  );
  const [savedFlash, setSavedFlash] = useState(false);
  const [savePending, startSave] = useTransition();
  const [milesPending, startMiles] = useTransition();

  const pickRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function processBlob(blob: Blob) {
    setError(null);
    setNotConfigured(false);
    setReading(true);
    try {
      const { base64, mediaType, previewUrl } = await downscaleImage(blob);
      setPreview(previewUrl);
      const result = await analyzeRateScreenshot({ base64, mediaType });
      if (!result.ok) {
        setError(result.reason);
        setNotConfigured(!result.configured);
        // Open the form for manual entry so the tool is still usable.
        setHasResult(true);
        return;
      }
      setForm(loadToForm(result.load, result.computedMiles));
      setMilesWereComputed(result.milesWereComputed);
      setHasResult(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image.");
    } finally {
      setReading(false);
    }
  }

  // Global paste — lets Brent press Ctrl+V anywhere on the page after a
  // Win+Shift+S snip. Only acts when the clipboard actually carries an image,
  // so pasting text into a field still works normally.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void processBlob(file);
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // processBlob is stable enough for this listener's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void processBlob(file);
  }

  function recomputeMiles() {
    startMiles(async () => {
      const r = await estimateMilesForZips(form.originZip, form.destZip);
      if (r.miles != null) {
        set("miles", String(r.miles));
        setMilesWereComputed(true);
        setError(null);
      } else if (r.reason) {
        setError(r.reason);
      }
    });
  }

  function saveCost() {
    const fd = new FormData();
    fd.append("cost_per_mile", cpm);
    if (margin.trim() !== "") fd.append("target_margin_pct", margin);
    startSave(async () => {
      try {
        await saveCostSettings(fd);
        setSavedFlash(true);
        setError(null);
        window.setTimeout(() => setSavedFlash(false), 2200);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save cost settings.");
      }
    });
  }

  // ---- Derived verdict numbers (recompute every render) ----
  const rateNum = parseNum(form.rate);
  const milesNum = parseNum(form.miles);
  const rpm = computeRpm(rateNum, milesNum);
  const cpmNum = parseNum(cpm);
  const marginNum = parseNum(margin) ?? 15;
  const tier = verdictFor(rpm, cpmNum, marginNum);
  const net =
    rateNum != null && milesNum != null && cpmNum != null
      ? rateNum - cpmNum * milesNum
      : null;
  const breakevenRpm = cpmNum;
  const targetRpm = cpmNum != null ? cpmNum * (1 + marginNum / 100) : null;

  return (
    <div className="space-y-4">
      {/* ---- Paste / pick zone ---- */}
      <section className="border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Load screenshot
        </p>
        <p className="mt-1 text-[12px] text-fg/70">
          Snip the broker&apos;s posting (Win+Shift+S) then press{" "}
          <kbd className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[11px]">
            Ctrl+V
          </kbd>{" "}
          anywhere here — or choose a file / snap a photo.
        </p>

        <div
          className={
            "mt-4 flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors " +
            (reading ? "border-fg/40 bg-elevated" : "border-line bg-elevated/40")
          }
        >
          {reading ? (
            <>
              <Spinner />
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-fg">
                Reading the posting…
              </p>
            </>
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Pasted load posting"
              className="max-h-44 w-auto rounded border border-line"
            />
          ) : (
            <>
              <IconImage />
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                Paste or add a screenshot
              </p>
            </>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => pickRef.current?.click()}
              disabled={reading}
              className="border-2 border-line bg-card px-4 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
            >
              Choose image
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={reading}
              className="border-2 border-line bg-card px-4 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-fg transition-colors hover:bg-elevated disabled:opacity-50"
            >
              Take photo
            </button>
            {preview ? (
              <button
                type="button"
                onClick={() => {
                  pickRef.current?.click();
                }}
                disabled={reading}
                className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-fg-subtle underline-offset-2 hover:underline disabled:opacity-50"
              >
                Replace
              </button>
            ) : null}
          </div>

          <input
            ref={pickRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            className="sr-only"
            aria-hidden
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFileChange}
            className="sr-only"
            aria-hidden
          />
        </div>

        {error ? (
          <p
            className={
              "mt-3 border-l-4 px-3 py-2 text-[12px] " +
              (notConfigured
                ? "border-l-amber-500 bg-amber-50 text-amber-900"
                : "border-l-red-500 bg-red-50 text-red-800")
            }
          >
            {error}
          </p>
        ) : null}
      </section>

      {/* ---- Extracted / editable form + verdict ---- */}
      {hasResult ? (
        <>
          {tier ? (
            <VerdictCard
              tier={tier}
              rpm={rpm}
              breakevenRpm={breakevenRpm}
              targetRpm={targetRpm}
              net={net}
            />
          ) : (
            <section className="border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
                Rate per mile
              </p>
              <p className="mt-2 font-mono text-[34px] font-bold leading-none tabular-nums text-fg">
                {rpm != null ? `$${rpm.toFixed(2)}` : "—"}
                <span className="ml-1 text-[14px] font-semibold text-fg-subtle">
                  /mi
                </span>
              </p>
              <p className="mt-2 text-[12px] text-fg/70">
                {cpmNum == null
                  ? "Set your cost-per-mile below to enable the take-it / pass verdict."
                  : "Enter rate and miles to see the verdict."}
              </p>
            </section>
          )}

          <section className="border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
                Load details
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-fg-subtle">
                Edit anything the AI misread
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Origin" value={form.originCity} onChange={(v) => set("originCity", v)} placeholder="Houston, TX" />
              <Field label="Destination" value={form.destCity} onChange={(v) => set("destCity", v)} placeholder="Greencastle, IN" />
              <Field label="Origin ZIP" value={form.originZip} onChange={(v) => set("originZip", v)} placeholder="77042" mono />
              <Field label="Dest ZIP" value={form.destZip} onChange={(v) => set("destZip", v)} placeholder="46135" mono />

              <label className="block sm:col-span-1">
                <span className={labelCls}>
                  Miles
                  {milesWereComputed ? (
                    <span className="ml-1.5 rounded-sm bg-blue-100 px-1.5 py-[1px] font-mono text-[8.5px] font-bold tracking-[0.08em] text-blue-700">
                      COMPUTED
                    </span>
                  ) : null}
                </span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={form.miles}
                    onChange={(e) => {
                      set("miles", e.target.value);
                      setMilesWereComputed(false);
                    }}
                    inputMode="decimal"
                    placeholder="1015"
                    className="block w-full border-2 border-line bg-card px-3 py-2 font-mono text-[15px] tabular-nums text-fg focus:border-fg focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={recomputeMiles}
                    disabled={milesPending}
                    title="Compute miles from the ZIP pair"
                    className="shrink-0 border-2 border-line bg-elevated px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-fg transition-colors hover:bg-card disabled:opacity-50"
                  >
                    {milesPending ? "…" : "↻ ZIP"}
                  </button>
                </div>
              </label>

              <Field
                label="Rate / total pay ($)"
                value={form.rate}
                onChange={(v) => set("rate", v)}
                placeholder="2500"
                mono
                inputMode="decimal"
              />

              <Field label="Equipment" value={form.equipment} onChange={(v) => set("equipment", v)} placeholder="Flatbed" />
              <Field label="Weight" value={form.weight} onChange={(v) => set("weight", v)} placeholder="42,000 lbs" />
              <Field label="Broker / company" value={form.broker} onChange={(v) => set("broker", v)} />
              <Field label="Contact" value={form.contact} onChange={(v) => set("contact", v)} mono />
              <Field label="Pickup date" value={form.pickupDate} onChange={(v) => set("pickupDate", v)} />
              <Field label="Delivery date" value={form.deliveryDate} onChange={(v) => set("deliveryDate", v)} />

              <label className="block sm:col-span-2">
                <span className={labelCls}>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                  className="mt-1 block w-full resize-y border-2 border-line bg-card px-3 py-2 text-[14px] text-fg focus:border-fg focus:outline-none"
                />
              </label>
            </div>
          </section>
        </>
      ) : null}

      {/* ---- Cost basis (always available) ---- */}
      <section className="border-2 border-line border-l-4 border-l-fg bg-card px-4 py-4 sm:px-5 sm:py-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-fg">
          Your cost basis
        </p>
        <p className="mt-1 text-[12px] text-fg/70">
          Break-even cost per mile drives the verdict. Net = rate −
          (cost/mi × miles). Target margin sets the green &ldquo;take
          it&rdquo; threshold (defaults to 15%).
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className={labelCls}>Cost per mile ($)</span>
            <input
              value={cpm}
              onChange={(e) => setCpm(e.target.value)}
              inputMode="decimal"
              placeholder="1.85"
              className="mt-1 block w-32 border-2 border-line bg-card px-3 py-2 font-mono text-[15px] tabular-nums text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Target margin %</span>
            <input
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              inputMode="decimal"
              placeholder="15"
              className="mt-1 block w-28 border-2 border-line bg-card px-3 py-2 font-mono text-[15px] tabular-nums text-fg focus:border-fg focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={saveCost}
            disabled={savePending}
            className="border-2 border-fg bg-fg px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-canvas transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {savePending ? "Saving…" : savedFlash ? "Saved ✓" : "Save"}
          </button>
        </div>
        {cost.costPerMile == null && !savedFlash ? (
          <p className="mt-3 border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Set your cost-per-mile to enable the verdict.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "decimal" | "text";
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={
          "mt-1 block w-full border-2 border-line bg-card px-3 py-2 text-[15px] text-fg focus:border-fg focus:outline-none " +
          (mono ? "font-mono tabular-nums " : "")
        }
      />
    </label>
  );
}

function VerdictCard({
  tier,
  rpm,
  breakevenRpm,
  targetRpm,
  net,
}: {
  tier: VerdictTier;
  rpm: number | null;
  breakevenRpm: number | null;
  targetRpm: number | null;
  net: number | null;
}) {
  const theme = {
    take: {
      wrap: "border-emerald-300 border-l-emerald-600 bg-emerald-50",
      label: "text-emerald-700",
      title: "TAKE IT",
      big: "text-emerald-700",
    },
    marginal: {
      wrap: "border-amber-300 border-l-amber-600 bg-amber-50",
      label: "text-amber-700",
      title: "MARGINAL",
      big: "text-amber-700",
    },
    pass: {
      wrap: "border-red-300 border-l-red-600 bg-red-50",
      label: "text-red-700",
      title: "PASS",
      big: "text-red-700",
    },
  }[tier];

  return (
    <section className={"border-2 border-l-4 px-4 py-4 sm:px-5 sm:py-5 " + theme.wrap}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={"font-mono text-[10px] font-bold uppercase tracking-[0.24em] " + theme.label}>
            Verdict
          </p>
          <p className={"mt-1 text-[34px] font-extrabold leading-none tracking-tight " + theme.big}>
            {theme.title}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-fg-subtle">
            Rate per mile
          </p>
          <p className="font-mono text-[30px] font-bold leading-none tabular-nums text-fg">
            {rpm != null ? `$${rpm.toFixed(2)}` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/60 pt-3 text-center">
        <Stat label="Break-even" value={breakevenRpm != null ? `$${breakevenRpm.toFixed(2)}` : "—"} sub="/mi" />
        <Stat label="Target" value={targetRpm != null ? `$${targetRpm.toFixed(2)}` : "—"} sub="/mi" />
        <Stat
          label="Est. net"
          value={money(net)}
          sub={net != null && net < 0 ? "loss" : "profit"}
          danger={net != null && net < 0}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: string;
  sub: string;
  danger?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-fg-subtle">
        {label}
      </p>
      <p
        className={
          "mt-1 font-mono text-[17px] font-bold tabular-nums leading-none " +
          (danger ? "text-red-700" : "text-fg")
        }
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-fg-subtle">
        {sub}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-line border-t-fg"
    />
  );
}

function IconImage() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-fg-subtle"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-4.5-4.5L7 20" />
    </svg>
  );
}
