/**
 * OpsStrip — single horizontal row of four operational facts.
 *
 * Replaces the four dashboard-card layout of LoadSummaryCard. Same
 * fields (pickup window, delivery window, contact, next action), but
 * inline rather than carded so it confirms the operational facts
 * without competing with the LaneHero and StatusHero above.
 *
 * Bordered top and bottom; no box per cell.
 */

export type OpsStripProps = {
  pickupLabel: string | null;
  deliveryLabel: string | null;
  contactLabel: string | null;
  /** Next-action verb, e.g. "Wait for accept", "Set pricing". */
  nextLabel: string | null;
  /** Tone for the next label — neutral by default. */
  nextTone?: "neutral" | "blue" | "amber" | "emerald";
};

export function OpsStrip({
  pickupLabel,
  deliveryLabel,
  contactLabel,
  nextLabel,
  nextTone = "neutral",
}: OpsStripProps) {
  const nextColor =
    nextTone === "blue"
      ? "text-blue-300"
      : nextTone === "amber"
        ? "text-amber-300"
        : nextTone === "emerald"
          ? "text-emerald-300"
          : "text-zinc-200";
  return (
    <div className="grid grid-cols-2 items-baseline gap-x-5 gap-y-2 border-y border-zinc-800 px-1 py-2.5 sm:grid-cols-4 sm:gap-x-6 xl:py-3 xl:gap-x-8">
      <Cell label="Pickup" value={pickupLabel} />
      <Cell label="Delivery" value={deliveryLabel} />
      <Cell label="Contact" value={contactLabel} mono />
      <Cell
        label="Next"
        value={nextLabel}
        valueClassName={nextColor + " font-medium"}
      />
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
  valueClassName,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  valueClassName?: string;
}) {
  const text = (value ?? "").trim();
  return (
    <div className="min-w-0">
      <span className="mr-2 font-mono text-[9px] font-medium uppercase tracking-[0.20em] text-zinc-500 xl:text-[10.5px]">
        {label}
      </span>
      <span
        className={
          (mono
            ? "font-mono tabular-nums text-[11.5px] xl:text-[13px] "
            : "font-mono text-[11.5px] tabular-nums xl:text-[13px] ") +
          (valueClassName ?? (text ? "text-zinc-200" : "text-zinc-600"))
        }
      >
        {text || "—"}
      </span>
    </div>
  );
}
