import Link from "next/link";
import Image from "next/image";
import { assets } from "@/lib/assets";
import { company } from "@/lib/company";
import { ServicesCarousel } from "@/components/home/ServicesCarousel";
import { HeroVideo } from "@/components/home/HeroVideo";

export default function Home() {
  return (
    <>
      <Hero />
      <ProcessSteps />
      <Services />
      <ProcessSummary />
      <About />
      <Dispatch />
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
              className="btn-cut inline-flex items-center justify-center bg-red-600 px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#000] transition-colors hover:bg-red-500 sm:px-8 sm:py-4 sm:text-sm"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="btn-outline-cut-light inline-flex items-center justify-center px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-zinc-900 transition-colors sm:py-4 sm:text-sm"
            >
              Call Dispatch
            </a>
          </div>

          {/* Credentials row — IBM Plex Mono 400 */}
          <dl className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase sm:mt-14">
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-500">USDOT</dt>
              <dd className="text-white">{company.dotNumber}</dd>
            </div>
            <span aria-hidden className="text-neutral-700">/</span>
            <div className="flex items-baseline gap-2">
              <dt className="text-neutral-500">MC</dt>
              <dd className="text-white">{company.mcNumber}</dd>
            </div>
            <span aria-hidden className="text-neutral-700">/</span>
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
    photoSrc: "/brand/operations/pipe-stop-sign-turbines.jpg",
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
    photoSrc: "/brand/operations/ocala-crates.jpg",
  },
  {
    slug: "heavy-equipment",
    title: "Heavy Equipment",
    tagline: "Lowboy \u2022 Permits \u2022 Pilot cars",
    description:
      "Construction and agricultural equipment moves. Permits, routing, and pilot cars handled in-house.",
    capabilities: "Lowboy \u00b7 Pilot cars \u00b7 Route planning \u00b7 Heavy equipment",
    photoSrc: "/brand/operations/rig-loaded-promaster.jpg",
    durationMs: 6000,
  },
  {
    slug: "expedited",
    title: "Expedited Freight",
    tagline: "Hot loads \u2022 Hard deadlines",
    description:
      "Tight pickup windows and hard delivery deadlines. Single driver through-runs with status updates en route.",
    capabilities: "Hot loads \u00b7 Hard deadlines \u00b7 Driver direct \u00b7 Through-run",
    photoSrc: "/brand/operations/IMG_0264.JPG",
  },
  {
    slug: "general",
    title: "General Freight",
    tagline: "Dry van \u2022 LTL & FTL",
    description:
      "Dry van and LTL/FTL across the lower 48. Scheduled pickup, clean handling, paperwork on completion.",
    capabilities: "Dry van \u00b7 LTL & FTL \u00b7 Lower 48 \u00b7 On-time delivery",
    photoSrc: "/brand/operations/rig-pipe-dirt-road.jpg",
    textPosition: "top-third",
    durationMs: 6000,
  },
];

function Services() {
  return (
    <section id="services" className="border-b-2 border-[#dcd5c2]/30 bg-[#141414] scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <ServicesCarousel services={serviceModules} />
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
  const steps = [
    {
      num: "01",
      title: "Submit load details",
      body:
        "Quote request through the form, by phone, or by email. Send what you know — dispatch asks if more is needed.",
    },
    {
      num: "02",
      title: "Dispatch reviews lane",
      body:
        "Dispatch checks capacity, equipment, and timing against your lane. Direct quote returned within hours — no bidding wars, no broker markups.",
    },
    {
      num: "03",
      title: "Quote is confirmed",
      body:
        "Once approved, we lock in pickup time, equipment, and a single point of contact through delivery.",
    },
    {
      num: "04",
      title: "Freight moves",
      body:
        "Door-to-door. Driver updates en route. Paperwork delivered at offload.",
    },
  ];
  return (
    <section
      id="process"
      className="border-b-2 border-[#dcd5c2]/30 bg-neutral-950 scroll-mt-16"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="relative">
          <ol className="grid grid-cols-1 gap-8 sm:grid-cols-4 sm:gap-4 lg:gap-6">
            {steps.map((step) => (
              <li
                key={step.num}
                className="relative flex flex-col items-center gap-3 text-center"
              >
                {/* Card above — beige fill, black text, red bottom accent */}
                <div className="card-cut flex w-full flex-1 flex-col border border-black/30 border-b-4 border-b-red-600 bg-[#dcd5c2] p-5 sm:p-6">
                  <h3 className="font-display text-lg font-bold uppercase tracking-tight text-black sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                    {step.body}
                  </p>
                </div>
                {/* Drop connector (sm+ only) — visual link from card to marker */}
                <div
                  aria-hidden
                  className="hidden h-4 w-px bg-red-600 sm:block"
                />
                {/* Numbered marker — sits on the horizontal spine */}
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-red-600 bg-[#0a0a0a]">
                  <span className="font-mono text-sm font-bold text-white">
                    {step.num}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {/* Horizontal red spine — hits the marker centers. bottom-5 =
              20px = half of the 40px (h-10) marker. The spine extends
              edge-to-edge of the grid; the marker fills sit on top of
              it at each column center, visually capping the line. */}
          <div
            aria-hidden
            className="absolute bottom-5 left-0 right-0 hidden h-[2px] bg-red-600 sm:block"
          />
        </div>
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
      className="border-b-2 border-[#dcd5c2]/30 bg-neutral-950"
    >
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
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
            className="btn-cut inline-block bg-red-600 px-8 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#000] transition-colors hover:bg-red-500"
          >
            Request a Quote
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- ABOUT --------------------------------- */

function About() {
  return (
    <section
      id="about"
      className="relative isolate overflow-hidden border-b-2 border-[#dcd5c2]/30 scroll-mt-16"
    >
      {/* Full-bleed background — aerial follow-shot of the carrier on route.
          Y-bias keeps the trailer in frame on widescreen crops and lets the
          truck/trailer (not the asphalt) carry the composition. */}
      <Image
        src="/brand/about-bg.jpg"
        alt=""
        fill
        sizes="100vw"
        className="-z-10 object-cover"
        style={{ objectPosition: "62% 78%" }}
      />
      {/* Dark wash — flat on mobile for full-image legibility; left-weighted
          gradient on desktop so the text side stays readable and the truck
          side shows more operational detail without going muddy. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/75 lg:hidden" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-black/85 via-black/45 to-black/15 lg:block"
      />

      {/* Content — left-aligned column, sat lower in the frame so the text
          settles into the composition instead of floating at the top. */}
      <div className="mx-auto max-w-7xl px-4 pt-24 pb-14 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-44 lg:pb-24">
        <div className="max-w-xl">
          <h2 className="text-4xl font-display tracking-tight text-white sm:text-5xl">
            The carrier.
          </h2>
          <div className="mt-8 space-y-5 text-base leading-relaxed text-neutral-200 lg:text-lg">
            <p>
              {company.legalName} is an owner-operated motor carrier serving
              industrial and construction freight customers across the
              lower 48.
            </p>
            <p>
              Equipment confirmed at quote. Pickup windows held to a stated
              time. Status updated during transit. Paperwork delivered on
              completion.
            </p>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-white/15 pt-8 sm:grid-cols-4">
            <Spec label="USDOT" value={company.dotNumber} />
            <Spec label="MC" value={company.mcNumber} />
            <Spec label="Operating" value={company.authorityText} />
            <Spec label="Dispatch" value={company.dispatchModel} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] tracking-[0.22em] text-neutral-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1.5 font-mono text-sm text-white sm:text-base">
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------- DISPATCH -------------------------------- */

function Dispatch() {
  return (
    <section className="border-b-2 border-[#dcd5c2]/30 bg-[#141414]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-end gap-x-12 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="text-4xl font-display tracking-tight text-white sm:text-5xl lg:text-6xl">
              Got a load?
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-400 sm:text-lg">
              Pickup, delivery, weight, equipment &mdash; that&apos;s all
              dispatch needs to send a quote back.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:col-span-5">
            <Link
              href="/quote"
              className="btn-cut block bg-red-600 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[inset_0_0_0_2px_#000] transition-colors hover:bg-red-500"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="btn-outline-cut-light block px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-zinc-900 transition-colors"
            >
              Call Dispatch
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
