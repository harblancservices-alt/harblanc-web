"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, CardHead, BTN_NEUTRAL } from "../_shell/ui";
import { CONTROL, LABEL } from "../_shell/form";
import { stripCommas } from "../_shell/format";
// formatMoney from the shared money module rather than _shell/format's:
// for whole dollars the two produce byte-identical output (same locale,
// same currency, same zero fraction digits), but this one also has the
// `cents` mode the two derived per-unit rates need — so the panel formats
// every figure through ONE function instead of pairing the CRM helper with
// a hand-rolled cents formatter. It's pure (money.ts only pulls in
// fuel.ts/trip-rollup.ts, both framework-free), so it's safe in a client
// component and pairs with the FUEL_DEFAULTS the pricing module already uses.
import { formatMoney } from "@/lib/domain/money";
import { computeQuote, QUOTE_DEFAULTS, type QuoteInputs } from "./quotePricing";

type FieldKey = keyof QuoteInputs;

const FIELDS: { key: FieldKey; label: string; group: "load" | "rates"; placeholder?: string }[] = [
  { key: "miles", label: "Miles", group: "load", placeholder: "0" },
  { key: "avgMph", label: "Avg speed (mph)", group: "load" },
  { key: "loadUnloadHours", label: "Load / unload (hrs)", group: "load" },
  { key: "mpg", label: "Truck MPG", group: "rates" },
  { key: "pricePerGallon", label: "Fuel ($/gal)", group: "rates" },
  { key: "hourlyRate", label: "Hourly rate ($/hr)", group: "rates" },
  { key: "brokeragePct", label: "Brokerage (%)", group: "rates" },
];

/** Starting text for every field. Miles is the one thing the rep must
 * actually supply, so it starts blank rather than pretending to a default. */
const INITIAL: Record<FieldKey, string> = {
  miles: "",
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

/** One label/value line in the breakdown. `tone` promotes a line to a
 * subtotal (heavier, hairline above) without inventing a new component. */
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
 * Operations → Quote Calculator. Live, entirely client-side: every figure
 * recomputes as the rep types, nothing is submitted, stored, or sent
 * anywhere. There is no server action and no route handler behind this
 * screen — the math is a pure function (./quotePricing.ts) and the output
 * is a number on the page, so there is nothing to persist.
 *
 * The formula is a house assumption ("average $125/hr with fuel and mph,
 * plus the 25% brokerage on top"), which is exactly why the panel makes all
 * seven inputs editable rather than hiding the rate assumptions behind a
 * single "Miles" box: a rep pricing an odd job can move the hourly rate or
 * the brokerage percentage for that quote and see the total follow. The
 * estimate note at the bottom says so out loud.
 *
 * Figures render in `.crm-num` (IBM Plex Mono, tabular-lining) so the column
 * of dollars stays aligned digit-for-digit as it updates — see the widened
 * scope note on that class in globals.css.
 */
export function QuoteCalculator() {
  const [raw, setRaw] = useState<Record<FieldKey, string>>(INITIAL);

  const inputs: QuoteInputs = useMemo(
    () => ({
      miles: toNumber(raw.miles),
      avgMph: toNumber(raw.avgMph),
      loadUnloadHours: toNumber(raw.loadUnloadHours),
      mpg: toNumber(raw.mpg),
      pricePerGallon: toNumber(raw.pricePerGallon),
      hourlyRate: toNumber(raw.hourlyRate),
      brokeragePct: toNumber(raw.brokeragePct),
    }),
    [raw],
  );

  const quote = useMemo(() => computeQuote(inputs), [inputs]);
  const hasMiles = inputs.miles > 0;

  function set(key: FieldKey, value: string) {
    setRaw((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setRaw(INITIAL);
  }

  function fieldGroup(group: "load" | "rates") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.filter((f) => f.group === group).map((f) => (
          <label key={f.key} className="flex w-full min-w-0 flex-col gap-1">
            <span className={LABEL}>{f.label}</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={raw[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
              className={`crm-num h-10 w-full min-w-0 ${CONTROL}`}
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHead
          title="Load details"
          hint="Everything here is editable per quote"
          right={
            <button
              type="button"
              onClick={reset}
              className={`inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-bold transition-colors ${BTN_NEUTRAL}`}
            >
              Reset
            </button>
          }
        />
        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg-muted">The load</p>
            {fieldGroup("load")}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg-muted">
              Truck &amp; rates
            </p>
            {fieldGroup("rates")}
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Quote breakdown" hint="Updates as you type" />
        <div className="flex flex-col p-4">
          {!hasMiles && (
            <p className="mb-3 rounded-md border border-accent/45 bg-accent/10 px-3.5 py-2.5 text-[13px] font-semibold text-accent">
              Enter the miles to price the load — everything below is only the dock time until you do.
            </p>
          )}

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
            hint={`Miles ÷ ${raw.mpg || "0"} mpg × ${formatMoney(inputs.pricePerGallon, { cents: true })}/gal`}
          />
          <Line label="Subtotal" value={formatMoney(quote.subtotal)} strong />
          <Line
            label="Brokerage fee"
            value={formatMoney(quote.brokerageFee)}
            hint={`${raw.brokeragePct || "0"}% of subtotal, on top`}
          />

          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-accent bg-accent/10 px-4 py-3.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-accent">
              Total quote
            </span>
            <span className="crm-num shrink-0 text-[26px] font-bold leading-none tracking-tight text-accent tabular-nums">
              {formatMoney(quote.total)}
            </span>
          </div>

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
            brokerage fee on top — adjust any input above for the job in front of you. Nothing here
            is saved or sent.
          </p>
        </div>
      </Card>
    </div>
  );
}
