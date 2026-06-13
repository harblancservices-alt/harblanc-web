/**
 * LaneHero — the primary visual element on the Load workspace.
 *
 * Three-column layout: pickup city + state on the left (right-aligned),
 * arrow + miles + drive-time in the center, delivery city + state on
 * the right (left-aligned). Underneath: a single pill with the pickup
 * and delivery date labels.
 *
 * When city/state is missing we render "—" rather than collapsing the
 * column, so the structure stays visually stable across the lifecycle.
 *
 * Pure presentational server component.
 */

export type LaneHeroProps = {
  pickupCityState: string | null;
  pickupZip: string | null;
  deliveryCityState: string | null;
  deliveryZip: string | null;
  miles: number | null;
  /** Optional drive-time chip text, e.g. "~16h drive". */
  driveTime?: string | null;
  /** Pre-formatted pickup date label, e.g. "Mon Jun 15". */
  pickupDateLabel: string | null;
  /** Pre-formatted delivery date label, e.g. "Wed Jun 17". */
  deliveryDateLabel: string | null;
};

export function LaneHero({
  pickupCityState,
  pickupZip,
  deliveryCityState,
  deliveryZip,
  miles,
  driveTime,
  pickupDateLabel,
  deliveryDateLabel,
}: LaneHeroProps) {
  const pickupText = pickupCityState ?? "—";
  const deliveryText = deliveryCityState ?? "—";
  const milesText = miles != null ? miles.toLocaleString() + " mi" : null;

  return (
    <section
      aria-label="Lane"
      className="px-3 pt-8 pb-7 sm:px-4 xl:pt-12 xl:pb-10"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-5 sm:gap-x-6 xl:gap-x-10 2xl:gap-x-14">
        {/* Pickup */}
        <div className="text-right">
          <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.24em] text-emerald-400 xl:text-[11px]">
            Pickup
          </p>
          <h1 className="mt-1.5 truncate text-[28px] font-medium leading-[1.05] tracking-tight text-white sm:text-[30px] xl:text-[42px] 2xl:text-[48px]">
            {pickupText}
          </h1>
          {pickupZip ? (
            <p className="mt-1 font-mono text-[12px] tabular-nums text-zinc-400 xl:text-[14px]">
              {pickupZip}
            </p>
          ) : (
            <p className="mt-1 font-mono text-[12px] text-zinc-600">&nbsp;</p>
          )}
        </div>

        {/* Center — arrow + miles + drive-time */}
        <div className="flex min-w-[56px] flex-col items-center gap-1.5">
          <RightArrow />
          {milesText ? (
            <p className="whitespace-nowrap font-mono text-[12.5px] font-medium tabular-nums text-zinc-300 xl:text-[15px]">
              {milesText}
            </p>
          ) : (
            <p className="whitespace-nowrap font-mono text-[12.5px] text-zinc-600">
              &mdash;
            </p>
          )}
          {driveTime ? (
            <p className="whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.16em] text-zinc-600 xl:text-[11px]">
              {driveTime}
            </p>
          ) : null}
        </div>

        {/* Delivery */}
        <div className="text-left">
          <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.24em] text-sky-300 xl:text-[11px]">
            Delivery
          </p>
          <h1 className="mt-1.5 truncate text-[28px] font-medium leading-[1.05] tracking-tight text-white sm:text-[30px] xl:text-[42px] 2xl:text-[48px]">
            {deliveryText}
          </h1>
          {deliveryZip ? (
            <p className="mt-1 font-mono text-[12px] tabular-nums text-zinc-400 xl:text-[14px]">
              {deliveryZip}
            </p>
          ) : (
            <p className="mt-1 font-mono text-[12px] text-zinc-600">&nbsp;</p>
          )}
        </div>
      </div>

      {/* Date pill */}
      {pickupDateLabel || deliveryDateLabel ? (
        <div className="mt-4 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-950/80 px-3.5 py-1.5 xl:gap-4 xl:px-5 xl:py-2">
            <span className="font-mono text-[11.5px] tabular-nums text-white xl:text-[14px]">
              {pickupDateLabel ?? "—"}
            </span>
            <RightArrow size={14} dim />
            <span className="font-mono text-[11.5px] tabular-nums text-white xl:text-[14px]">
              {deliveryDateLabel ?? "—"}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RightArrow({
  size = 28,
  dim = false,
}: {
  size?: number;
  dim?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={dim ? "text-zinc-700" : "text-zinc-600"}
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
