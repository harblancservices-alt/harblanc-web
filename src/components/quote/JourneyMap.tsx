/**
 * JourneyMap — the "What happens next" section on /quote/success.
 *
 * Freight route board. The customer follows the lifecycle from request
 * to delivery as a sequence of dispatch checkpoints down the page.
 *
 *   - Vertical red spine on the left runs the length of the route.
 *   - Mile-marker squares (graphite fill, red border, mono number) sit
 *     on the spine at each step.
 *   - Milestone panels (graphite, no border) extend to the right of each
 *     marker carrying a status label, title, and short body.
 *   - On desktop, every-other panel is offset slightly right to break the
 *     hard column rhythm without zig-zagging.
 *
 * The structure is HTML/Tailwind — no inline SVG infographic chrome. Red
 * is restrained to the spine, the marker borders, and step 01\u2019s status
 * label (the only "current" milestone). Status text on remaining steps
 * stays zinc.
 *
 * Mobile-first: the same markup renders cleanly on a narrow viewport.
 * Desktop adds the alternating panel offset.
 */

type Step = {
  n: string;
  when: string;
  title: string;
  body: string;
};

const flowSteps: readonly Step[] = [
  {
    n: "01",
    when: "Next",
    title: "Shipment under review",
    body: "We are reviewing the lane, the load and current capacity. The range comes back by email \u2014 straightforward pricing, ready to move on.",
  },
  {
    n: "02",
    when: "If the range works",
    title: "Complete the shipment intake",
    body: "Fill out the shipment intake \u2014 pickup window, equipment, contacts, special handling. This is what dispatch needs to firm up the rate.",
  },
  {
    n: "03",
    when: "After intake review",
    title: "Receive the finalized quote",
    body: "Dispatch reviews your intake and sends a finalized quote with the locked-in rate. No surprises, no markup later \u2014 what\u2019s on it is what you pay.",
  },
  {
    n: "04",
    when: "Before pickup",
    title: "Accept and pay the rate",
    body: "Confirm the finalized quote and pay through secure card processing. The lane is not on dispatch\u2019s schedule until payment clears.",
  },
  {
    n: "05",
    when: "On the road",
    title: "Pickup and delivery",
    body: "Dispatch coordinates pickup with your contact, the driver heads out, and we keep you posted from origin through delivery.",
  },
];

export function JourneyMap() {
  return (
    <section className="bg-[#050505]">
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-14 sm:px-6 sm:pb-10 sm:pt-20 lg:px-8 lg:pb-12 lg:pt-24">
        {/* Section header */}
        <h2 className="text-3xl font-display font-medium text-white sm:text-4xl">
          What happens <span className="text-green-500">next</span>..
        </h2>
        <div aria-hidden className="mt-3 h-[4px] w-20 bg-red-600" />

        {/* Route board */}
        <ol className="mt-10">
          {flowSteps.map((step, i) => {
            const isLast = i === flowSteps.length - 1;
            return (
              <li
                key={step.n}
                className={
                  isLast
                    ? "relative pl-14 sm:pl-20"
                    : "relative pb-4 pl-14 sm:pl-20"
                }
              >
                {/* Spine segment for this step */}
                {i === 0 ? (
                  <>
                    {/* Green spine — full height of step 01 li, ending at the dot */}
                    <div
                      aria-hidden
                      className="absolute bottom-0 left-[18px] top-0 w-px bg-green-500 sm:left-[22px]"
                    />
                    {/* Red extension — below the dot, into the gap toward step 02 */}
                    <div
                      aria-hidden
                      className="absolute left-[18px] top-full h-4 w-px bg-red-600 sm:left-[22px]"
                    />
                    {/* Pulsing "you are here" dot at the green/red transition */}
                    <span
                      aria-hidden
                      className="absolute left-0 bottom-0 z-10 flex h-9 w-9 items-center justify-center sm:left-1"
                    >
                      <span className="relative flex h-[18px] w-[18px]">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-[18px] w-[18px] rounded-full bg-green-500" />
                      </span>
                    </span>
                  </>
                ) : (
                  <div
                    aria-hidden
                    className={
                      isLast
                        ? "absolute left-[18px] top-0 h-12 w-px bg-red-600 sm:left-[22px]"
                        : "absolute bottom-0 left-[18px] top-0 w-px bg-red-600 sm:left-[22px]"
                    }
                  />
                )}

                {/* Mile-marker square on the spine */}
                <div
                  aria-hidden
                  className={
                    i === 0
                      ? "absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-green-500 bg-[#141414] sm:left-1"
                      : "absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-red-600 bg-[#141414] sm:left-1"
                  }
                >
                  <span className="font-mono text-sm font-bold text-white">
                    {step.n}
                  </span>
                </div>

                {/* Milestone panel */}
                <div className={i === 0 ? "card-cut border border-[#27272a] border-r-4 border-r-green-500 bg-[#141414] p-4 text-center sm:min-h-[150px] sm:p-5" : "card-cut border border-[#27272a] border-r-4 border-r-red-600 bg-[#141414] p-4 text-center sm:min-h-[150px] sm:p-5"}>
<h3 className={i === 0 ? "text-base font-semibold text-green-500 sm:text-lg" : "text-base font-semibold text-red-500 sm:text-lg"}>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

      </div>
    </section>
  );
}
