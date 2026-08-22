"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Card, CardHead, BTN_NEUTRAL, DEPTH_PRIMARY } from "../_shell/ui";
import { CONTROL, LABEL } from "../_shell/form";
import { stripCommas, titleCaseWords, upperCaseState } from "../_shell/format";
import { IconChevronDown, IconMapPin } from "../_shell/icons";
// formatMoney from the shared money module rather than _shell/format's: for
// whole dollars the two produce byte-identical output (same locale, same
// currency, same zero fraction digits), but this one also has the `cents`
// mode the per-unit rates need — so the panel formats every figure through
// ONE function instead of pairing the CRM helper with a hand-rolled cents
// formatter. It's pure (money.ts only pulls in fuel.ts/trip-rollup.ts, both
// framework-free), so it's safe in a client component and pairs with the
// FUEL_DEFAULTS the pricing module already uses.
import { formatMoney } from "@/lib/domain/money";
import { computeQuote, QUOTE_DEFAULTS, type QuoteInputs } from "./quotePricing";
import { isCompleteZip, normalizeZip, type LaneMilesLookup } from "./laneLookup";
import { lookupLaneMiles } from "./lane-actions";

type RateKey = Exclude<keyof QuoteInputs, "miles">;

const RATE_FIELDS: { key: RateKey; label: string }[] = [
  { key: "avgMph", label: "Avg speed (mph)" },
  { key: "loadUnloadHours", label: "Load / unload (hrs)" },
  { key: "mpg", label: "Truck MPG" },
  { key: "pricePerGallon", label: "Fuel ($/gal)" },
  { key: "hourlyRate", label: "Hourly rate ($/hr)" },
  { key: "brokeragePct", label: "Brokerage (%)" },
];

const INITIAL_RATES: Record<RateKey, string> = {
  avgMph: String(QUOTE_DEFAULTS.avgMph),
  loadUnloadHours: String(QUOTE_DEFAULTS.loadUnloadHours),
  mpg: String(QUOTE_DEFAULTS.mpg),
  pricePerGallon: String(QUOTE_DEFAULTS.pricePerGallon),
  hourlyRate: String(QUOTE_DEFAULTS.hourlyRate),
  brokeragePct: String(QUOTE_DEFAULTS.brokeragePct),
};

/** Text field -> number. A blank or half-typed value ("", "4.", "-") lands
 * on 0 or NaN here and is neutralised again by computeQuote's own guard, so
 * a figure can never render as NaN mid-keystroke. */
function toNumber(value: string): number {
  return Number(stripCommas(value).trim());
}

function formatHours(value: number): string {
  return `${value.toFixed(1)} h`;
}

/** One label/value line in the breakdown. `strong` promotes a line to a
 * subtotal (heavier, hairline above) without inventing a second component. */
function Line({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${
        strong ? "border-t border-line-strong pt-2.5" : ""
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-[13px] ${strong ? "font-bold text-fg" : "font-medium text-fg-muted"}`}>
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-[11.5px] font-medium text-fg-muted">{hint}</span>}
      </span>
      <span
        className={`crm-num shrink-0 tabular-nums ${
          strong ? "text-[16px] font-bold text-fg" : "text-[14px] font-semibold text-fg"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Operations → Quote Calculator.
 *
 * Three stacked sections, in the order a rep actually works: the LANE at the
 * top, the ANSWER in the middle, and the rate ASSUMPTIONS collapsed at the
 * bottom. Each is a Card + CardHead — the shared section-header-band idiom
 * the rest of the CRM uses — so the screen reads as a hierarchy rather than
 * one long undifferentiated form. Figures are `.crm-num` (IBM Plex Mono,
 * tabular lining) so the money column doesn't jitter as it updates; see the
 * scope note on that class in globals.css.
 *
 * ONE server round trip, and only for ZIP → miles (./lane-actions.ts). The
 * pricing itself is a pure function (./quotePricing.ts) recomputed in the
 * browser on every keystroke; nothing is submitted, stored, or sent.
 *
 * Miles is never locked to the lookup. The estimate is great-circle × 1.18,
 * not a routed distance, so the field stays editable and a rep who knows the
 * lane runs long — or whose ZIP isn't in the dataset — just types over it.
 * `milesTouched` is what keeps an on-blur lookup from silently stomping a
 * number someone entered by hand; the explicit "Get miles" button is the
 * deliberate way to overwrite it.
 */
export function QuoteCalculator() {
  const [originZip, setOriginZip] = useState("");
  const [destZip, setDestZip] = useState("");
  const [miles, setMiles] = useState("");
  const [rates, setRates] = useState<Record<RateKey, string>>(INITIAL_RATES);
  const [lane, setLane] = useState<LaneMilesLookup | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [pending, startTransition] = useTransition();

  /** True once the rep has typed in the Miles box themselves. Blocks the
   * on-blur auto-lookup from overwriting their number. */
  const milesTouched = useRef(false);
  /** The lane a lookup has already run for, so tabbing back and forth
   * between two unchanged ZIP fields doesn't refire the action. */
  const lookedUpLane = useRef<string | null>(null);

  const inputs: QuoteInputs = useMemo(
    () => ({
      miles: toNumber(miles),
      avgMph: toNumber(rates.avgMph),
      loadUnloadHours: toNumber(rates.loadUnloadHours),
      mpg: toNumber(rates.mpg),
      pricePerGallon: toNumber(rates.pricePerGallon),
      hourlyRate: toNumber(rates.hourlyRate),
      brokeragePct: toNumber(rates.brokeragePct),
    }),
    [miles, rates],
  );

  const quote = useMemo(() => computeQuote(inputs), [inputs]);
  const hasMiles = inputs.miles > 0;
  const bothZipsComplete = isCompleteZip(originZip) && isCompleteZip(destZip);

  function runLookup(force: boolean) {
    if (!bothZipsComplete) return;
    const key = `${normalizeZip(originZip)}-${normalizeZip(destZip)}`;
    if (!force && lookedUpLane.current === key) return;
    lookedUpLane.current = key;

    startTransition(async () => {
      const result = await lookupLaneMiles({ originZip, destZip });
      setLane(result);
      if (result.ok) {
        setMiles(String(result.miles));
        milesTouched.current = false;
      }
    });
  }

  /** Auto-lookup when a ZIP field is left and the lane is newly complete —
   * unless the rep has already put their own number in Miles. */
  function onZipBlur() {
    if (milesTouched.current) return;
    runLookup(false);
  }

  function setRate(key: RateKey, value: string) {
    setRates((prev) => ({ ...prev, [key]: value }));
  }

  function resetRates() {
    setRates(INITIAL_RATES);
  }

  const laneLabel =
    lane?.ok === true
      ? `${titleCaseWords(lane.originCity)}, ${upperCaseState(lane.originState)} → ${titleCaseWords(
          lane.destinationCity,
        )}, ${upperCaseState(lane.destinationState)}`
      : null;

  return (
    <div className="space-y-4">
      {/* ── ROUTE ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title="Route"
          hint="Enter the lane and we'll estimate the miles"
          right={
            <button
              type="button"
              onClick={() => runLookup(true)}
              disabled={!bothZipsComplete || pending}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-60 ${BTN_NEUTRAL}`}
            >
              <IconMapPin width={14} height={14} />
              {pending ? "Looking up…" : "Get miles"}
            </button>
          }
        />
        <div className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <label className="flex w-full min-w-0 flex-col gap-1">
              <span className={LABEL}>Origin ZIP</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={10}
                placeholder="77002"
                value={originZip}
                onChange={(e) => setOriginZip(e.target.value)}
                onBlur={onZipBlur}
                className={`crm-num h-10 w-full min-w-0 ${CONTROL}`}
              />
            </label>

            <span aria-hidden className="hidden pb-2.5 text-[15px] font-bold text-fg-muted sm:block">
              →
            </span>

            <label className="flex w-full min-w-0 flex-col gap-1">
              <span className={LABEL}>Destination ZIP</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={10}
                placeholder="75201"
                value={destZip}
                onChange={(e) => setDestZip(e.target.value)}
                onBlur={onZipBlur}
                className={`crm-num h-10 w-full min-w-0 ${CONTROL}`}
              />
            </label>

            <span aria-hidden className="hidden pb-2.5 text-[15px] font-bold text-fg-muted sm:block">
              =
            </span>

            <label className="flex w-full min-w-0 flex-col gap-1">
              <span className={LABEL}>Miles</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={miles}
                onChange={(e) => {
                  milesTouched.current = true;
                  setMiles(e.target.value);
                }}
                className={`crm-num h-10 w-full min-w-0 font-bold ${CONTROL}`}
              />
            </label>
          </div>

          {lane?.ok === true && (
            <p className="text-[12.5px] font-semibold text-ok">
              {laneLabel} · <span className="crm-num tabular-nums">{lane.miles}</span> mi estimated.
              Editable — override it if you know the lane runs longer.
            </p>
          )}
          {lane?.ok === false && (
            <p className="text-[12.5px] font-semibold text-warn">{lane.error}</p>
          )}
          {!lane && (
            <p className="text-[12.5px] font-medium text-fg-muted">
              Miles fill in from the two ZIPs, or type them straight in — whichever is faster.
            </p>
          )}
        </div>
      </Card>

      {/* ── THE ANSWER ─────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Quote" hint="Updates as you type" />

        <div className="flex flex-col items-center gap-1 border-b border-line-strong bg-accent/10 px-4 py-6 text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
            Total quote
          </span>
          <span className="crm-num text-[44px] font-bold leading-none tracking-tight text-accent tabular-nums sm:text-[54px]">
            {formatMoney(quote.total)}
          </span>
          {!hasMiles && (
            <span className="mt-1 text-[12.5px] font-semibold text-warn">
              No miles yet — this is dock time only.
            </span>
          )}
        </div>

        <div className="flex flex-col p-4">
          <Line label="Drive hours" value={formatHours(quote.driveHours)} hint="Miles ÷ avg speed" />
          <Line label="Total hours" value={formatHours(quote.totalHours)} hint="Drive + load / unload" />

          <Line
            label="Time cost"
            value={formatMoney(quote.timeCost)}
            hint={`${formatHours(quote.totalHours)} × ${formatMoney(inputs.hourlyRate)}/hr`}
            strong
          />
          <Line
            label="Fuel cost"
            value={formatMoney(quote.fuelCost)}
            hint={`Miles ÷ ${rates.mpg || "0"} mpg × ${formatMoney(inputs.pricePerGallon, { cents: true })}/gal`}
          />
          <Line label="Subtotal" value={formatMoney(quote.subtotal)} strong />
          <Line
            label="Brokerage fee"
            value={formatMoney(quote.brokerageFee)}
            hint={`${rates.brokeragePct || "0"}% of subtotal, on top`}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-line-strong bg-inset px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted">
                Effective $/mile
              </p>
              <p className="crm-num mt-1 text-[17px] font-bold text-fg tabular-nums">
                {quote.perMile === null ? "—" : formatMoney(quote.perMile, { cents: true })}
              </p>
            </div>
            <div className="rounded-md border border-line-strong bg-inset px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-fg-muted">
                Effective $/hr
              </p>
              <p className="crm-num mt-1 text-[17px] font-bold text-fg tabular-nums">
                {quote.perHour === null ? "—" : formatMoney(quote.perHour, { cents: true })}
              </p>
            </div>
          </div>

          <p className="mt-4 border-t border-line-strong pt-3 text-[12.5px] font-medium leading-relaxed text-fg-muted">
            Estimate only. It prices time at a blended hourly rate plus diesel, then adds the
            brokerage fee on top — open Rate assumptions to adjust any of it for the job in front of
            you. Nothing here is saved or sent.
          </p>
        </div>
      </Card>

      {/* ── ASSUMPTIONS (collapsed by default) ─────────────────────────── */}
      <Card>
        <CardHead
          title="Rate assumptions"
          hint={`${QUOTE_DEFAULTS.avgMph} mph · ${QUOTE_DEFAULTS.mpg} mpg · ${formatMoney(
            QUOTE_DEFAULTS.hourlyRate,
          )}/hr · ${QUOTE_DEFAULTS.brokeragePct}% brokerage`}
          right={
            <div className="flex items-center gap-2">
              {showAssumptions && (
                <button
                  type="button"
                  onClick={resetRates}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAssumptions((v) => !v)}
                aria-expanded={showAssumptions}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-bold transition-colors ${DEPTH_PRIMARY}`}
              >
                {showAssumptions ? "Hide" : "Adjust"}
                <IconChevronDown
                  width={14}
                  height={14}
                  className={showAssumptions ? "rotate-180 transition-transform" : "transition-transform"}
                />
              </button>
            </div>
          }
        />
        {showAssumptions && (
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {RATE_FIELDS.map((f) => (
              <label key={f.key} className="flex w-full min-w-0 flex-col gap-1">
                <span className={LABEL}>{f.label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rates[f.key]}
                  onChange={(e) => setRate(f.key, e.target.value)}
                  className={`crm-num h-10 w-full min-w-0 ${CONTROL}`}
                />
              </label>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
