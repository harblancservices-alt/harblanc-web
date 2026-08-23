"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Card, CardHead, BTN_NEUTRAL } from "../_shell/ui";
// The COMPACT tokens, not _shell/form's bundled CONTROL: that one bakes in
// its own roomy padding for list search bars. CONTROL + CONTROL_SIZE is the
// pair every dense CRM form uses (~26px controls on desktop, comfortable tap
// targets below `sm`), and NARROW caps a numeric field at a width that suits
// the digits in it instead of letting it stretch across the column.
import { CONTROL, CONTROL_SIZE, LABEL, NARROW } from "../_shell/compactForm";
import { stripCommas, titleCaseWords, upperCaseState } from "../_shell/format";
import { IconMapPin } from "../_shell/icons";
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
  { key: "mpg", label: "Truck MPG" },
  { key: "pricePerGallon", label: "Fuel ($/gal)" },
  { key: "hourlyRate", label: "Hourly rate ($/hr)" },
  { key: "brokeragePct", label: "Brokerage (%)" },
];

const INITIAL_RATES: Record<RateKey, string> = {
  avgMph: String(QUOTE_DEFAULTS.avgMph),
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
      className={`flex items-baseline justify-between gap-3 py-1 ${
        strong ? "border-t border-line-strong pt-1.5" : ""
      }`}
    >
      <span className="min-w-0">
        <span
          className={`block text-[12.5px] leading-tight ${
            strong ? "font-bold text-fg" : "font-medium text-fg-muted"
          }`}
        >
          {label}
        </span>
        {hint && (
          <span className="block text-[11px] font-medium leading-tight text-fg-muted">{hint}</span>
        )}
      </span>
      <span
        className={`crm-num shrink-0 leading-tight tabular-nums ${
          strong ? "text-[15px] font-bold text-fg" : "text-[13.5px] font-semibold text-fg"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * One of the three per-mile rates under the breakdown. Each is a different
 * slice of the same quote — what the shipper pays, what the carrier gets,
 * what's left for the broker — so all three share one tile treatment rather
 * than one of them being visually promoted; the big TOTAL band above is
 * already the headline. Renders "—" (never $0.00) when there are no miles,
 * so an empty lane reads as "not computed yet", not "free".
 */
function PerMileTile({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: number | null;
}) {
  return (
    <div className="rounded-md border border-line-strong bg-inset px-2.5 py-1.5">
      <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-fg-muted">
        {label}
      </p>
      <p className="crm-num text-[17px] font-bold leading-tight text-fg tabular-nums">
        {value === null ? "—" : formatMoney(value, { cents: true })}
      </p>
      <p className="text-[10.5px] font-medium leading-tight text-fg-muted">{sub}</p>
    </div>
  );
}

/**
 * Operations → Quote Calculator.
 *
 * TWO COLUMNS on lg+ (Brent's approved layout): the ANSWER on the left,
 * always visible, and the INPUTS you drive it with on the right. Below lg
 * they stack, PRICING FIRST — the source order is answer-then-inputs, so the
 * stacked view needs no order overrides and a phone opens on the number.
 *
 * The formula, the ZIP→miles action, and every default are untouched from
 * the previous single-column version; this is a layout change only. Figures
 * are `.crm-num` (IBM Plex Mono, tabular lining) so the money column doesn't
 * jitter as it updates — see the scope note on that class in globals.css.
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

  /**
   * ZIPs are passed in explicitly rather than read off state: the auto-run
   * below fires from inside an onChange, in the same tick as the setState
   * for that field, so the state variable is still the PREVIOUS value there.
   */
  function runLookup({
    force,
    origin = originZip,
    dest = destZip,
  }: {
    force: boolean;
    origin?: string;
    dest?: string;
  }) {
    if (!isCompleteZip(origin) || !isCompleteZip(dest)) return;
    const key = `${normalizeZip(origin)}-${normalizeZip(dest)}`;
    if (!force && lookedUpLane.current === key) return;
    lookedUpLane.current = key;

    startTransition(async () => {
      const result = await lookupLaneMiles({ originZip: origin, destZip: dest });
      setLane(result);
      if (result.ok) {
        setMiles(String(result.miles));
        milesTouched.current = false;
      }
    });
  }

  /**
   * Fires the moment the DESTINATION becomes a complete ZIP and an origin is
   * already in — no blur, no button (Brent). Typing the last digit of the
   * destination is the signal that the lane is fully described, so that's
   * when the miles should appear.
   *
   * Guarded three ways: only when both ZIPs are complete, only when the rep
   * hasn't hand-typed a mileage (milesTouched), and only once per distinct
   * lane (lookedUpLane) — so continuing to type a ZIP+4 suffix, which
   * normalizes to the same 5 digits, doesn't refire the action.
   */
  function onDestZipChange(value: string) {
    setDestZip(value);
    if (milesTouched.current) return;
    runLookup({ force: false, dest: value });
  }

  /** Backstop for the other direction: origin edited AFTER a destination is
   * already sitting there. Same guards. */
  function onZipBlur() {
    if (milesTouched.current) return;
    runLookup({ force: false });
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
    // items-start so the two columns size to their own content instead of
    // the right stack stretching to match the pricing card's height.
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {/* ══ LEFT — THE PRICING (the answer, always visible) ══════════════ */}
      <Card>
        <CardHead title="Quote" hint="Updates as you type" />

        {/* The hero band: solid accent, white figure. The one place on this
            screen that reads as a filled surface rather than a card face. */}
        <div className="flex flex-col items-center gap-0.5 border-b border-line-strong bg-accent px-4 py-3.5 text-center">
          <span className="text-[10.5px] font-bold uppercase leading-none tracking-[0.14em] text-white">
            Total quote
          </span>
          <span className="crm-num text-[36px] font-bold leading-none tracking-tight text-white tabular-nums sm:text-[42px]">
            {formatMoney(quote.total)}
          </span>
          {!hasMiles && (
            // A pill, not dimmed text — legible on the filled band without
            // reaching for a faint tint.
            // With load/unload gone, zero miles is a genuine zero — every
            // leg of the quote is a function of miles now, so this can't say
            // "dock time only" any more.
            <span className="mt-0.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold text-white">
              Add the lane or the miles to price this load
            </span>
          )}
        </div>

        <div className="flex flex-col px-3 py-2">
          <Line label="Drive hours" value={formatHours(quote.driveHours)} hint="Miles ÷ avg speed" />

          <Line
            label="Time cost"
            value={formatMoney(quote.timeCost)}
            hint={`${formatHours(quote.driveHours)} × ${formatMoney(inputs.hourlyRate)}/hr`}
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

          {/* Three views of the SAME total, split by who the money is for.
              Carrier + Broker = Shipper, always (subtotal + fee = total) —
              pinned by a test in quotePricing.test.ts. */}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <PerMileTile
              label="Shipper $/mi"
              sub="All-in, per mile"
              value={quote.shipperPerMile}
            />
            <PerMileTile
              label="Carrier $/mi"
              sub="Base pay, per mile"
              value={quote.carrierPerMile}
            />
            <PerMileTile
              label="Broker $/mi"
              sub="Margin, per mile"
              value={quote.brokerPerMile}
            />
          </div>

          <p className="mt-2.5 border-t border-line-strong pt-2 text-[11.5px] font-medium leading-snug text-fg-muted">
            Estimate only — time at a blended hourly rate plus diesel, then the brokerage fee on
            top. Adjust the route or the rate assumptions for the job in front of you. Nothing here
            is saved or sent.
          </p>
        </div>
      </Card>

      {/* ══ RIGHT — THE INPUTS you drive it with ════════════════════════ */}
      <div className="flex flex-col gap-3">
        <Card>
          <CardHead
            title="Route"
            hint="Enter the lane and we'll estimate the miles"
            right={
              <button
                type="button"
                onClick={() => runLookup({ force: true })}
                disabled={!bothZipsComplete || pending}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-60 ${BTN_NEUTRAL}`}
              >
                <IconMapPin width={14} height={14} />
                {pending ? "Looking up…" : "Get miles"}
              </button>
            }
          />
          <div className="flex flex-col gap-2 px-3 py-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
              <label className="flex w-full min-w-0 flex-col gap-0.5">
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
                  className={`crm-num w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
                />
              </label>

              <span aria-hidden className="pb-1 text-[14px] font-bold text-fg-muted sm:pb-[5px]">
                →
              </span>

              <label className="flex w-full min-w-0 flex-col gap-0.5">
                <span className={LABEL}>Destination ZIP</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={10}
                  placeholder="75201"
                  value={destZip}
                  onChange={(e) => onDestZipChange(e.target.value)}
                  onBlur={onZipBlur}
                  className={`crm-num w-full min-w-0 ${CONTROL_SIZE} ${CONTROL}`}
                />
              </label>
            </div>

            <label className="flex w-full min-w-0 flex-col gap-0.5">
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
                className={`crm-num w-full min-w-0 font-bold ${NARROW.short} ${CONTROL_SIZE} ${CONTROL}`}
              />
            </label>

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

        <Card>
          <CardHead
            title="Rate assumptions"
            hint="Editable per quote — the total follows live"
            right={
              <button
                type="button"
                onClick={resetRates}
                className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
              >
                Reset
              </button>
            }
          />
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-3">
            {RATE_FIELDS.map((f) => (
              <label key={f.key} className="flex w-full min-w-0 flex-col gap-0.5">
                <span className={LABEL}>{f.label}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={rates[f.key]}
                  onChange={(e) => setRate(f.key, e.target.value)}
                  // NARROW.short caps these at 6.5rem on desktop — every one
                  // of them holds 1–4 digits, so a full-width box was mostly
                  // dead space. Mobile keeps the full cell width.
                  className={`crm-num w-full min-w-0 ${NARROW.short} ${CONTROL_SIZE} ${CONTROL}`}
                />
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
