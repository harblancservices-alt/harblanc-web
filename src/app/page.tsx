import Link from "next/link";
import Image from "next/image";
import { assets } from "@/lib/assets";
import { company } from "@/lib/company";

export default function Home() {
  return (
    <>
      <Hero />
      <OpsBar />
      <Services />
      <Operations />
      <Process />
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
    <section className="relative isolate overflow-hidden border-b border-neutral-800 bg-neutral-950">
      {/* Background media — full bleed, focal point biased toward the road */}
      {heroVideo ? (
        <video
          src={heroVideo}
          poster={assets.heroVideoPoster ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          style={{ objectPosition: "center 65%" }}
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

      {/* Flat dark wash — uniform, no gradient. Heavier on mobile for
          readability, lighter on desktop so the footage still reads. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/70 lg:bg-black/55" />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-10 lg:py-40">
        <div className="max-w-xl lg:max-w-2xl">
          {/* Eyebrow — small red bar + location line, IBM Plex Mono 400 */}
          <p className="flex items-center gap-3 font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            EST. 2022 &middot; HOUSTON TEXAS
          </p>

          {/* Headline — Inter Black (900); both lines white for contrast,
              tight industrial tracking, line 2 carries a leading red bar */}
          <h1 className="mt-6 text-4xl font-display leading-[0.95] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl xl:text-7xl">
            Freight, hauled
            <span className="mt-2 flex items-baseline gap-3 sm:gap-4">
              <span aria-hidden className="inline-block h-[0.6em] w-[6px] shrink-0 bg-red-600 sm:w-2" />
              direct.
            </span>
          </h1>

          {/* Body */}
          <p className="mt-7 max-w-lg text-base leading-relaxed text-neutral-200 sm:text-lg">
            Licensed motor carrier running hotshot, expedited, equipment, and
            general freight across the {company.serviceArea.toLowerCase()}.
            Owner-operated dispatch. No broker layers, no auto-replies.
          </p>

          {/* CTAs — primary solid (heavier), secondary outlined.
              Stacked full-width on mobile, intrinsic-width inline on desktop. */}
          <div className="mt-10 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <Link
              href="/quote"
              className="btn-cut inline-flex w-full items-center justify-center bg-red-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500 sm:w-auto"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="btn-outline-cut inline-flex w-full items-center justify-center px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors sm:w-auto"
            >
              Call Dispatch
            </a>
          </div>

          {/* Credentials row — IBM Plex Mono 400 */}
          <dl className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase">
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

/* ------------------------------- OPS BAR --------------------------------- */

function OpsBar() {
  const items: { label: string; main: string }[] = [
    { label: "Response", main: "Time-Critical Freight" },
    { label: "Dispatch", main: "Owner Operated" },
    { label: "Authority", main: "Licensed & Insured" },
    { label: "Service", main: "Reliable & Efficient" },
  ];
  return (
    <section className="border-b border-neutral-900 bg-black">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 sm:grid-cols-4">
          {items.map((item, i) => (
            <li
              key={item.label}
              className={
                "px-2 py-3 sm:px-4 sm:py-4 " +
                (i > 0 ? "sm:border-l border-neutral-900 " : "") +
                (i >= 2 ? "border-t border-neutral-900 sm:border-t-0 " : "")
              }
            >
              <p className="font-mono text-[10px] tracking-[0.22em] text-red-500 uppercase">
                {item.label}
              </p>
              <p className="mt-1 text-sm text-neutral-200 sm:text-base">
                {item.main}
              </p>
            </li>
          ))}
        </ul>
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
};

const serviceModules: ServiceModule[] = [
  {
    slug: "hotshot",
    title: "Hotshot Hauling",
    tagline: "Time-critical \u2022 Direct dispatch",
    description:
      "Time-critical loads on flatbeds, gooseneck, and lowboy trailers. Direct dispatch, fast turnaround, single point of contact from booking to BOL.",
    capabilities: "Flatbeds \u00b7 Gooseneck \u00b7 Lowboy \u00b7 Same-day pickup",
  },
  {
    slug: "expedited",
    title: "Expedited Freight",
    tagline: "No stops \u2022 No delays",
    description:
      "When the load can't wait. Tight pickup windows, hard delivery deadlines, single driver running it through with status updates en route.",
    capabilities: "Hot loads \u00b7 Hard deadlines \u00b7 Driver direct \u00b7 Through-run",
  },
  {
    slug: "equipment",
    title: "Equipment Hauling",
    tagline: "Oversized \u2022 Permits \u2022 Routing",
    description:
      "Construction equipment, machinery, agricultural gear, and oversized loads. Permits and routing handled. Pilot cars arranged when required.",
    capabilities: "Oversized loads \u00b7 Permit handling \u00b7 Route planning \u00b7 Heavy equipment",
  },
  {
    slug: "general",
    title: "General Freight",
    tagline: "Reliable \u2022 Efficient \u2022 Nationwide",
    description:
      "Standard freight at a fair rate. Reliable scheduling, clean handling, paperwork done right. Lower 48 coverage with on-time delivery.",
    capabilities: "Dry van \u00b7 LTL & FTL \u00b7 Lower 48 \u00b7 On-time delivery",
  },
];

function Services() {
  return (
    <section id="services" className="border-b border-neutral-900 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul className="divide-y divide-neutral-900">
          {serviceModules.map((mod) => (
            <ServiceRow key={mod.slug} module={mod} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ServiceRow({ module }: { module: ServiceModule }) {
  return (
    <li className="py-8 sm:py-10">
      <h3 className="font-display text-2xl uppercase leading-[1.05] tracking-tight text-white sm:text-3xl">
        {module.title}
      </h3>
      <p className="mt-2 font-mono text-[11px] tracking-[0.22em] text-red-500/70 uppercase">
        {module.capabilities}
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
        {module.description}
      </p>
    </li>
  );
}

/* -------------------------------- PROCESS -------------------------------- */

function Process() {
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
      className="border-b border-neutral-900 bg-neutral-950 scroll-mt-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="py-5 lg:py-7">
          <div className="grid items-center gap-x-10 gap-y-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-2xl font-display tracking-tight text-white sm:text-3xl lg:text-right">
                Simple process, submit in under 60 seconds
              </p>
            </div>
            {/* Nested 2-col grid mirrors the Dispatch CTA row below so the
                Process button aligns horizontally with the red Dispatch
                button. Only the first cell is filled; the right cell stays
                intentionally empty. */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:col-span-5">
              <Link
                href="/quote"
                className="btn-cut block bg-red-600 px-6 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500"
              >
                Request a Quote
              </Link>
            </div>
          </div>
        </header>

        <ol className="grid grid-cols-1 border-t border-neutral-900 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li
              key={step.num}
              className={
                "py-8 sm:px-6 lg:px-8 lg:py-10 " +
                (i > 0 ? "border-t border-neutral-900 sm:border-l " : "") +
                (i === 1 || i === 3 ? "sm:border-t-0 " : "") +
                (i >= 2 ? "lg:border-t-0 " : "")
              }
            >
              <p className="font-mono text-xs text-neutral-500">{step.num}</p>
              <h3 className="mt-2 text-lg font-display uppercase tracking-tight text-white sm:text-xl">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------ OPERATIONS ------------------------------- */
/*
 * Restrained operational proof strip. Four real-load photos with small
 * font-mono labels — no captions doing marketing work, no carousel, no
 * lifestyle cards. Photos carry the section; copy stays out of the way.
 */

type OpsPhoto = { src: string; caption: string };

const opsPhotos: OpsPhoto[] = [
  {
    src: "/brand/operations/rig-loaded-promaster.jpg",
    caption: "Loaded gooseneck",
  },
  {
    src: "/brand/operations/ocala-crates.jpg",
    caption: "Secured freight",
  },
  {
    src: "/brand/operations/pipe-stop-sign-turbines.jpg",
    caption: "Equipment move",
  },
  {
    src: "/brand/operations/rig-pipe-dirt-road.jpg",
    caption: "Road-ready",
  },
];

function Operations() {
  return (
    <section
      id="operations"
      className="border-y border-neutral-800 bg-neutral-950"
    >
      {/* Contained strip — same gutter as Services / Process / Company.
          No eyebrow, no heading, no captions. The photos do the work and
          the strip reads as a transition between Services and Process. */}
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
        <h2 className="sr-only">Operational photos</h2>
        <ul
          aria-label="Recent freight and equipment hauls"
          className="grid grid-cols-2 gap-[2px] lg:grid-cols-4"
        >
          {opsPhotos.map((photo) => (
            <li
              key={photo.src}
              className="relative h-40 overflow-hidden sm:h-52 lg:h-56"
            >
              <Image
                src={photo.src}
                alt=""
                fill
                sizes="(min-width: 1024px) 22vw, 45vw"
                className="object-cover brightness-95 contrast-105"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------- ABOUT --------------------------------- */

function About() {
  return (
    <section
      id="about"
      className="relative isolate overflow-hidden border-b border-neutral-800 scroll-mt-16"
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
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Company
          </p>
          <h2 className="mt-4 text-4xl font-display tracking-tight text-white sm:text-5xl">
            The carrier.
          </h2>
          <div className="mt-8 space-y-5 text-base leading-relaxed text-neutral-200 lg:text-lg">
            <p>
              {company.legalName} is a licensed motor carrier moving hotshot,
              expedited, equipment, and general freight across the
              contiguous United States.
            </p>
            <p>
              We run dispatch directly. When customers call, they reach the
              people moving the load &mdash; not a brokerage call center.
              Quotes are direct. Pricing is honest. We don&apos;t bid loads
              against ghost competitors or layer markups on top of capacity
              we don&apos;t own.
            </p>
            <p>
              Equipment confirmed at quote. Pickup windows held to a stated
              time. Status updated by the driver. Paperwork delivered on
              completion. That&apos;s the job.
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
    <section className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid items-end gap-x-12 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
              Dispatch
            </p>
            <h2 className="mt-4 text-4xl font-display tracking-tight text-white sm:text-5xl lg:text-6xl">
              Got a load?
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-400 sm:text-lg">
              Pickup, delivery, weight, equipment. That&apos;s all dispatch
              needs to send back a quote.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:col-span-5">
            <Link
              href="/quote"
              className="btn-cut block bg-red-600 px-6 py-4 text-center text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="btn-outline-cut block px-6 py-4 text-center text-sm font-semibold uppercase tracking-[0.14em] text-white transition-colors"
            >
              Call Dispatch
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
