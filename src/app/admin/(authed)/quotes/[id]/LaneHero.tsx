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
  const milesText = miles != null ? miles.toLocaleString() + " mi" : "—";
  const pickupZipText = pickupZip ?? " ";
  const deliveryZipText = deliveryZip ?? " ";

  return (
    <section aria-label="Lane" className="bg-card">
      {/* Desktop / wide — unchanged flex row. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-stretch">
        {/* Pickup */}
        <div className="min-w-[150px] flex-1 px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Pickup
          </p>
          <p className="mt-0.5 truncate text-[18px] font-semibold leading-tight text-fg xl:text-[20px]">
            {pickupText}
          </p>
          <p className="font-mono text-[12px] font-medium tabular-nums text-blue-700">
            {pickupZip ?? " "}
          </p>
        </div>

        {/* Center — arrow + miles + drive-time */}
        <div className="flex flex-col items-center justify-center self-stretch border-l border-line px-4 py-2 text-fg-subtle">
          <RightArrow />
          <p className="whitespace-nowrap font-mono text-[12.5px] font-semibold tabular-nums text-fg">
            {milesText}
          </p>
          {driveTime ? (
            <p className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.14em] text-fg-subtle">
              {driveTime}
            </p>
          ) : null}
        </div>

        {/* Delivery */}
        <div className="min-w-[150px] flex-1 border-l border-line px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            Delivery
          </p>
          <p className="mt-0.5 truncate text-[18px] font-semibold leading-tight text-fg xl:text-[20px]">
            {deliveryText}
          </p>
          <p className="font-mono text-[12px] font-medium tabular-nums text-blue-700">
            {deliveryZip ?? " "}
          </p>
        </div>

        {/* Pickup date */}
        <div className="min-w-[110px] border-l border-line px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
            Pickup date
          </p>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-fg">
            {pickupDateLabel ?? "—"}
          </p>
        </div>

        {/* Delivery date */}
        <div className="min-w-[110px] border-l border-line px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
            Delivery date
          </p>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-fg">
            {deliveryDateLabel ?? "—"}
          </p>
        </div>
      </div>

      {/* Mobile/tablet — real 2-col stack instead of a flex-wrap row that
          broke divider lines and crammed cells mid-wrap on a phone. */}
      <div className="grid grid-cols-2 lg:hidden">
        <div className="border-b border-r border-line px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Pickup
          </p>
          <p className="mt-0.5 truncate text-[17px] font-semibold leading-tight text-fg">{pickupText}</p>
          <p className="font-mono text-[12px] font-medium tabular-nums text-blue-700">{pickupZipText}</p>
        </div>
        <div className="border-b border-line px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-blue-700">
            Delivery
          </p>
          <p className="mt-0.5 truncate text-[17px] font-semibold leading-tight text-fg">{deliveryText}</p>
          <p className="font-mono text-[12px] font-medium tabular-nums text-blue-700">{deliveryZipText}</p>
        </div>

        <div className="col-span-2 flex items-center justify-center gap-2 border-b border-line px-3.5 py-2 text-fg-subtle">
          <RightArrow size={16} />
          <p className="whitespace-nowrap font-mono text-[12.5px] font-semibold tabular-nums text-fg">{milesText}</p>
          {driveTime ? (
            <p className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.14em] text-fg-subtle">
              {driveTime}
            </p>
          ) : null}
        </div>

        <div className="border-r border-line px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
            Pickup date
          </p>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-fg">{pickupDateLabel ?? "—"}</p>
        </div>
        <div className="px-3.5 py-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
            Delivery date
          </p>
          <p className="mt-0.5 font-mono text-[13px] tabular-nums text-fg">{deliveryDateLabel ?? "—"}</p>
        </div>
      </div>
    </section>
  );
}

function RightArrow({ size = 20 }: { size?: number }) {
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
      className="text-fg-subtle"
    >
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
