import Link from "next/link";
import Image from "next/image";
import { assets } from "@/lib/assets";
import { company } from "@/lib/company";
import { HeroVideo } from "@/components/home/HeroVideo";
import { ServicesShowcase } from "@/components/home/ServicesShowcase";

export default function Home() {
  return (
    <>
      <Hero />
      <ProcessSteps />
      <Services />
      <ProcessSummary />
      <About />
    </>
  );
}

const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

/* -------------------------------- HERO ----------------------------------- */
/*
 * Layered hero: media (video → image → none) full-bleed, flat dark wash
 * over the top for legibility (no gradients), content block left-anchored.
 * Object-position is biased toward the lower half where vehicle/road
 * content typically lives in dashcam-style footage.
 */

function Hero() {
  const heroVideo = assets.heroVideo;
  const heroImage = assets.heroImage;
  return (
    <section className="relative isolate overflow-hidden border-b-2 border-[#dcd5c2]/30 bg-neutral-950">
      {/* Background media — full bleed, focal point biased toward the road */}
      {heroVideo ? (
        <HeroVideo
          src={heroVideo}
          poster={assets.heroVideoPoster ?? undefined}
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_60%] sm:object-[center_65%]"
        />
      ) : heroImage ? (
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
          style={{ objectPosition: assets.heroImagePosition }}
        />
      ) : null}

      {/* Flat dark wash — lighter than before so the video reads
          through on every breakpoint. Legibility comes from the
          text-shadow on the headline/body, not from cranking overlay
          opacity. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/55 lg:bg-black/45" />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-10 lg:py-36">
        <div className="max-w-xl lg:max-w-2xl">
          {/* Eyebrow — small red bar + location line, IBM Plex Mono 400 */}
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            EST. 2022 &middot; HOUSTON TEXAS
          </p>

          {/* Headline — Inter Black (900); both lines white for contrast,
              tight industrial tracking, line 2 carries a leading red bar */}
          <h1 className="mt-5 text-4xl font-display leading-[0.95] tracking-[-0.02em] text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.55)] sm:mt-6 sm:text-5xl lg:text-6xl xl:text-7xl">
            Freight, hauled
            <span className="mt-2 flex items-baseline gap-3 sm:gap-4">
              <span aria-hidden className="inline-block h-[0.6em] w-[6px] shrink-0 bg-red-600 sm:w-2" />
              direct.
            </span>
          </h1>

          {/* Body */}
          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-neutral-100 [text-shadow:0_1px_6px_rgba(0,0,0,0.5)] sm:mt-7 sm:text-lg">
            Steel, pipe, equipment, and construction materials across
            the lower 48. Owner-operated dispatch from quote to delivery.
          </p>

          {/* CTAs — intrinsic width at every breakpoint (no full-width
              blocky look on mobile), tighter mobile padding so the
              hero doesn't read as a stack of oversized buttons.
              Stacked + left-aligned on mobile, inline on sm+. */}
          <div className="mt-8 flex flex-col items-center gap-2.5 sm:mt-10 sm:flex-row sm:items-start sm:gap-3">
            <Link
              href="/quote"
              className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#fff] transition-colors hover:bg-red-500 sm:px-8 sm:py-4 sm:text-sm"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="btn-outline-cut-light inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-colors sm:py-4 sm:text-sm"
            >
              Call Dispatch
            </a>
          </div>

          {/* Credentials row — IBM Plex Mono 400 */}
          <dl className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase sm:mt-14">
            <div className="flex items-baseline gap-2">
              <dt className="text-white">USDOT</dt>
              <dd className="text-white">{company.dotNumber}</dd>
            </div>
            <span aria-hidden className="text-white">/</span>
            <div className="flex items-baseline gap-2">
              <dt className="text-white">MC</dt>
              <dd className="text-white">{company.mcNumber}</dd>
            </div>
            <span aria-hidden className="text-white">/</span>
            <div>
              <dt className="sr-only">Operating status</dt>
              <dd className="text-white">{company.authorityText}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- SERVICES -------------------------------- */
/*
 * Capability manifest — no intro, no row numbers.
 * Four service rows, vertical-flow content, thin dividers.
 * Title leads each row; tagline / description / capability spec follow.
 */

type ServiceModule = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  capabilities: string;
  /** Placeholder photo for the carousel featured tile. Swap
   *  these out for dedicated per-service photography when
   *  available; today they reuse operations-strip images. */
  photoSrc: string;
  /** Optional carousel overrides — see ServicesCarousel for behavior. */
  textPosition?: "top" | "top-third" | "bottom";
  durationMs?: number;
};

const serviceModules: ServiceModule[] = [
  {
    slug: "steel-pipe",
    title: "Steel & Pipe",
    tagline: "Flatbed \u2022 Strapped, chained, tarped",
    description:
      "Coiled steel, pipe sections, and structural beams. Flatbed and gooseneck handling with strap, chain, and tarp coverage as the load requires.",
    capabilities: "Flatbed \u00b7 Gooseneck \u00b7 Oversized \u00b7 Permits",
    photoSrc: "/brand/666.png",
    textPosition: "top-third",
    durationMs: 6000,
  },
  {
    slug: "construction-materials",
    title: "Construction Materials",
    tagline: "Site deliveries \u2022 Scheduled drops",
    description:
      "Site deliveries for active jobs. Scheduled drops, contractor coordination, paperwork on completion.",
    capabilities: "Aggregates \u00b7 Lumber \u00b7 Rebar \u00b7 Precast",
    photoSrc: "/brand/enhanced2.png",
  },
  {
    slug: "heavy-equipment",
    title: "Heavy Equipment",
    tagline: "Lowboy \u2022 Permits \u2022 Pilot cars",
    description:
      "Construction and agricultural equipment moves. Permits, routing, and pilot cars handled in-house.",
    capabilities: "Lowboy \u00b7 Pilot cars \u00b7 Route planning \u00b7 Heavy equipment",
    photoSrc: "/brand/enhanced3.png",
    durationMs: 6000,
  },
  {
    slug: "expedited",
    title: "Expedited Freight",
    tagline: "Hot loads \u2022 Hard deadlines",
    description:
      "Tight pickup windows and hard delivery deadlines. Single driver through-runs with status updates en route.",
    capabilities: "Hot loads \u00b7 Hard deadlines \u00b7 Driver direct \u00b7 Through-run",
    photoSrc: "/brand/enhanced5.png",
  },
  {
    slug: "general",
    title: "General Freight",
    tagline: "Dry van \u2022 LTL & FTL",
    description:
      "Dry van and LTL/FTL across the lower 48. Scheduled pickup, clean handling, paperwork on completion.",
    capabilities: "Dry van \u00b7 LTL & FTL \u00b7 Lower 48 \u00b7 On-time delivery",
    photoSrc: "/brand/enhanced4.png",
    textPosition: "top-third",
    durationMs: 6000,
  },
];

function Services() {
  return (
    <section
      id="services"
      className="border-b-2 border-[#dcd5c2]/30 bg-black scroll-mt-16"
    >

      {/* ── MOBILE (<sm) ──────────────────────────────────────────
          Existing mobile layout preserved as-is, just wrapped in a
          sm:hidden container so the desktop branch can have its own
          wider max-width without breaking mobile. */}
      <div className="mx-auto max-w-6xl px-4 sm:hidden">
        {/* Mobile photo tiles — each row is a full-bleed photo tile with
            title + chevron overlay. */}
        <ul className="space-y-1">
          {serviceModules.map((svc) => {
            // Steel & Pipe (tile 1) and Expedited Freight (tile 4) get
            // their overlay anchored TOP-left instead of bottom-left.
            // Photo composition for those two reads better with text up top.
            const overlayTop =
              svc.slug === "steel-pipe" || svc.slug === "expedited";
            return (
              <li key={svc.slug}>
                <Link href="/quote" className="group/row block">
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
                    <Image
                      src={svc.photoSrc}
                      alt=""
                      fill
                      sizes="100vw"
                      className="object-cover"
                    />
                    {/* Gradient flips with overlay position — dark mass
                        on whichever edge the text sits, transparent
                        toward the photo so the freight stays visible. */}
                    <div
                      aria-hidden
                      className={
                        overlayTop
                          ? "absolute inset-0 bg-gradient-to-b from-black via-black/45 to-transparent"
                          : "absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent"
                      }
                    />
                    <div
                      className={
                        overlayTop
                          ? "absolute inset-x-0 top-0 px-5 pt-5"
                          : "absolute inset-x-0 bottom-0 px-5 pb-5"
                      }
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-display text-xl font-black uppercase tracking-tight text-white">
                          {svc.title}
                        </p>
                        <span
                          aria-hidden
                          className="font-mono text-xl font-bold text-red-500"
                        >
                          &rsaquo;
                        </span>
                      </div>
                      <div
                        aria-hidden
                        className="mt-3 h-[2px] w-12 bg-red-500"
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

      </div>

      {/* ── DESKTOP (sm+) ──────────────────────────────────────────
          New freight-first chapter showcase. Wider max-width (1400px)
          so the hero photo can be ~600px tall at full breakpoint. */}
      <div className="mx-auto hidden max-w-[1500px] px-4 py-6 sm:block sm:px-6 sm:py-8">
        <ServicesShowcase services={serviceModules} />
      </div>
    </section>
  );
}

/* ----------------------------- PROCESS STEPS ----------------------------- */

/**
 * ProcessSteps — the 4-card horizontal checkpoint route, lifted out of
 * the old combined Process section so it can sit directly under the
 * Hero. The "Simple process, submit in under 60 seconds" headline +
 * Request a Quote CTA now live in ProcessSummary below the Services
 * carousel, so it functions as the closing CTA of the process/services
 * arc rather than the introduction.
 *
 * Surface is bg-neutral-950 with a beige hairline seam at the bottom —
 * unchanged from when this lived inside Process().
 */
function ProcessSteps() {
  // Each step carries an icon key picked to match the mockup. Icons
  // render as inline SVG inside a beige circular badge at the top of
  // each card.
  const steps = [
    {
      num: "01",
      title: "Submit Load Details",
      body:
        "Quote request through the form, by phone, or by email. Send what you know — dispatch asks if more is needed.",
    },
    {
      num: "02",
      title: "Dispatch Reviews Lane",
      body:
        "Dispatch checks capacity, equipment, and timing against your lane. Direct quote returned within hours — no bidding wars, no broker markups.",
    },
    {
      num: "03",
      title: "Quote Is Confirmed",
      body:
        "Once approved, we lock in pickup time, equipment, and a single point of contact through delivery.",
    },
    {
      num: "04",
      title: "Freight Moves",
      body:
        "Door-to-door. Driver updates en route. Paperwork delivered at offload.",
    },
  ];

  return (
    <section
      id="process"
      className="relative overflow-hidden border-b-2 border-[#dcd5c2]/30 bg-black py-20 scroll-mt-16 sm:py-24 lg:py-28"
    >
      {/* Topographic SVG layer — kept at low opacity behind everything */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-repeat bg-center"
        style={{ backgroundImage: "url('/brand/footer-topo.svg')", backgroundSize: "600px 600px" }}
      />

      <div className="relative z-10 mx-auto max-w-[1450px] px-5 sm:px-8 lg:px-10">
        <div className="mb-10 max-w-3xl">
          <h2 className="font-mono text-3xl font-black uppercase tracking-tight text-red-500 sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-xl font-medium leading-snug text-white sm:text-2xl">
            Simple freight coordination from request to delivery.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-4">
          {steps.map((step) => (
            <li key={step.num} className="group relative min-h-[320px] overflow-hidden rounded-xl border border-neutral-800 bg-[#111111] px-8 py-10 shadow-[0_18px_45px_rgba(0,0,0,0.28)] lg:min-h-[340px]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-red-600" />
              <div className="relative text-center">
                <div className="font-mono text-5xl font-black leading-none tracking-tight text-red-500">
                  {step.num}
                </div>
                <div aria-hidden className="mx-auto mt-5 h-[3px] w-12 bg-red-600" />
                <h3 className="mx-auto mt-6 max-w-[16rem] text-center text-2xl font-black uppercase leading-[1.02] tracking-tight text-white">
                  {step.title}
                </h3>
                <p className="mx-auto mt-6 max-w-[18rem] text-center text-base leading-7 text-neutral-300">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}


/* ---------------------------- PROCESS SUMMARY ---------------------------- */

/**
 * ProcessSummary — the "Simple process, submit in under 60 seconds"
 * headline paired with the Request a Quote CTA. Sits below the Services
 * carousel so it acts as the closing CTA for the process/services arc:
 *   ProcessSteps  →  Services  →  ProcessSummary (CTA)  →  About
 *
 * No longer sticky on mobile — when this block intro'd the steps the
 * sticky pin kept the CTA in view while scrolling the route, but in
 * its new role as a closing CTA the sticky behavior would pin the
 * headline across the About section, which reads as off-topic.
 */
function ProcessSummary() {
  return (
    <section
      id="quote-cta"
      className="relative overflow-hidden border-b-2 border-[#dcd5c2]/30 bg-black"
    >
      {/* Layer 1 — topographic SVG (matches Footer pattern) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-repeat bg-center"
        style={{ backgroundImage: "url('/brand/footer-topo.svg')", backgroundSize: "600px 600px" }}
      />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
        {/* Closing CTA — headline on top, button below, both centered.
            Replaces the earlier 7/5 split that had the headline drifting
            left while the button anchored right; the centered stack reads
            tighter and matches its new role as a focused call to action. */}
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="font-display text-2xl tracking-tight text-white sm:text-3xl">
            Simple process, submit in under 60 seconds
          </p>
          <Link
            href="/quote"
            className="btn-cut inline-block bg-red-600 px-8 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#fff] transition-colors hover:bg-red-500"
          >
            Request a Quote
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- CARRIER + DISPATCH ------------------------- */
/*
 * One hero-style panel. Full-bleed aerial truck photo is the section.
 * Left-weighted gradient covers ~50% on desktop for text legibility while
 * keeping the right 45-55% of the image visible. Mobile gets a flat dark
 * wash for readability. Bottom dark band holds the Got a Load CTA so the
 * photo, brand stats, and dispatch hand-off live in one continuous frame.
 */

function About() {
  return (
    <section
      id="about"
      className="relative isolate overflow-hidden border-b-2 border-[#dcd5c2]/30 scroll-mt-16 min-h-[500px] lg:min-h-[680px]"
    >
      {/* LAYER 1 - Full-bleed AI-extended aerial photo. The wider source
          (base-field-truck.png) means object-cover crops gracefully on
          every viewport without dropping the truck out of frame. */}
      <Image
        src="/brand/base-field-truck.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-[60%_45%] lg:object-[55%_55%]"
        style={{
          filter: "contrast(1.08) saturate(1.14) brightness(1.04)",
        }}
        quality={92}
      />

      {/* LAYER 2 - Left-weighted gradient (desktop). Strong dark band on
          the left for legibility, with the right edge still slightly
          damped so the truck doesn't glare. */}
      <div
        aria-hidden
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.78) 28%, rgba(0,0,0,0.48) 48%, rgba(0,0,0,0.18) 68%, rgba(0,0,0,0.08) 100%)",
        }}
      />

      {/* LAYER 2b - Mobile flat dark wash for full legibility. */}
      <div aria-hidden className="absolute inset-0 bg-black/50 lg:hidden" />

      {/* LAYER 2c - Subtle bottom fade for CTA readability. Sits behind the
          CTA band and gives buttons + heading a soft dark backing without
          requiring the band itself to be opaque. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-72 lg:block"
        style={{
          background:
            "linear-gradient(0deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.42) 45%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* LAYER 3 - Content column. Flex column so the top region grows
          and the CTA band overlay pins to the bottom of the section. */}
      <div className="relative z-10 flex min-h-[500px] flex-col lg:min-h-[680px]">

        {/* TOP: Carrier text overlay, vertically centered, anchored LEFT */}
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
            <div className="max-w-[640px]">
              <div className="font-mono text-[12px] font-bold uppercase tracking-[0.28em] text-red-500">
                The Carrier
              </div>

              <h2 className="mt-3 font-display text-4xl leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-6xl">
                HARBLANC SERVICES LLC
              </h2>

              <div className="mt-6 space-y-5 text-base leading-relaxed text-white lg:text-lg">
                <p>
                  HARBLANC SERVICES LLC is an owner-operated motor carrier
                  serving industrial and construction freight customers across
                  the lower 48.
                </p>
                <p>
                  Equipment confirmed at quote. Pickup windows held to a
                  stated time. Status updated during transit. Paperwork
                  delivered on completion.
                </p>
              </div>

              <div aria-hidden className="mt-10 h-px w-full bg-red-500/70" />

              <dl className="mt-8 grid max-w-md grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
                <Stat label="USDOT" value={company.dotNumber} />
                <Stat label="MC" value={company.mcNumber} />
                <Stat label="Operating" value={company.authorityText} />
                <Stat label="Dispatch" value={company.dispatchModel} />
              </dl>
            </div>
          </div>
        </div>

        {/* BOTTOM: Got a Load CTA band - translucent overlay with a red
            top hairline. Heading + buttons live inside the same 640px
            column as the carrier text above, so the buttons hug the
            copy instead of floating off to the right. */}
        <div className="border-t border-red-500/70 bg-black/35">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-5 lg:px-8 lg:py-5">
            <div className="flex max-w-[640px] flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex flex-1 items-start gap-4 sm:gap-5">
                <span aria-hidden className="mt-1 block h-9 w-1 flex-none bg-red-500 sm:h-10 lg:h-11" />
                <div>
                  <h3 className="font-display text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-4xl lg:text-4xl">
                    Got a Load?
                  </h3>
                  <p className="mt-2 text-sm text-white sm:text-base">
                    Pickup, delivery, weight, equipment &mdash; that&apos;s all
                    dispatch needs to send a quote back.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-none lg:gap-2">
                <Link
                  href="/quote"
                  className="btn-cut block bg-red-600 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#fff] transition-colors hover:bg-red-500"
                >
                  Request a Quote
                </Link>
                <a
                  href={phoneHref}
                  className="btn-outline-cut-light block px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors"
                >
                  Call Dispatch
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Stat - single text-only cell in the carrier stat row.
 * Red mono label above, bold white value below. No icon, no box, no border.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">
        {label}
      </dt>
      <dd className="mt-1.5 text-base font-bold text-white sm:text-lg">
        {value}
      </dd>
    </div>
  );
}
