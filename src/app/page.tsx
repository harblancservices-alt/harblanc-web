import Link from "next/link";
import Image from "next/image";
import { assets } from "@/lib/assets";
import { company, services } from "@/lib/company";
import { MediaSlot } from "@/components/site/MediaSlot";

export default function Home() {
  return (
    <>
      <Hero />
      <OpsBar />
      <Services />
      <Process />
      <About />
      <Dispatch />
    </>
  );
}

const phoneHref = `tel:${company.dispatchPhone.replace(/[^\d+]/g, "")}`;

/* -------------------------------- HERO ----------------------------------- */
/*
 * Layered hero: media (video → image → none) as background, dark gradient
 * anchored to the left, content block (eyebrow → headline → body → CTAs →
 * mono credentials row) overlays the left side. The truck/video stays
 * visible on the right; the left side gets a strong wash of black for text
 * legibility without flooding the whole image.
 */

function Hero() {
  const heroVideo = assets.heroVideo;
  const heroImage = assets.heroImage;
  return (
    <section className="relative isolate overflow-hidden border-b border-neutral-800 bg-neutral-950">
      {/* Background media — full bleed */}
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

      {/* Left-anchored dark wash — heavier on mobile, fades to transparent on desktop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/90 to-black/40 lg:via-black/75 lg:to-transparent"
      />

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <div className="max-w-xl lg:max-w-2xl">
          {/* Eyebrow — brand + year, mono with red bar */}
          <p className="flex items-center gap-3 text-[11px] font-bold tracking-[0.22em] text-red-500 uppercase">
            <span aria-hidden className="inline-block h-3 w-1 bg-red-600" />
            Est. {company.established} &middot; {company.legalName}
          </p>

          {/* Headline */}
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-7xl">
            Freight, hauled
            <br />
            <span className="text-neutral-400">direct.</span>
          </h1>

          {/* Body */}
          <p className="mt-6 max-w-lg text-base leading-relaxed text-neutral-200 sm:text-lg">
            Licensed motor carrier running hotshot, expedited, equipment, and
            general freight across the {company.serviceArea.toLowerCase()}.
            Owner-operated dispatch. No broker layers, no auto-replies.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col gap-2.5 sm:max-w-md sm:flex-row">
            <Link
              href="/quote"
              className="block w-full bg-red-600 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white shadow-lg shadow-black/40 transition-colors hover:bg-red-500"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="block w-full border border-white/30 bg-black/40 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition-colors hover:border-white hover:bg-black/60"
            >
              Call Dispatch
            </a>
          </div>

          {/* Operational status row — mono credentials anchoring authority */}
          <dl className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.18em] uppercase">
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
  const items = [
    { label: "USDOT", value: company.dotNumber },
    { label: "MC", value: company.mcNumber },
    { label: "Coverage", value: company.serviceArea },
    { label: "Authority", value: company.authorityText },
  ];
  return (
    <section className="border-b border-neutral-800 bg-black">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={item.label}
              className={
                "px-2 py-5 sm:px-4 " +
                (i > 0 ? "sm:border-l border-neutral-800 " : "") +
                (i >= 2 ? "border-t border-neutral-800 sm:border-t-0 " : "")
              }
            >
              <dt className="font-mono text-[10px] tracking-[0.2em] text-neutral-500 uppercase">
                {item.label}
              </dt>
              <dd className="mt-1.5 font-mono text-sm text-white sm:text-base">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------- SERVICES -------------------------------- */

function Services() {
  return (
    <section id="services" className="border-b border-neutral-800 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="border-b border-neutral-800 py-14 lg:py-20">
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Freight Services
          </p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            One carrier. Four lanes of work.
          </h2>
        </header>

        <ul className="divide-y divide-neutral-800">
          {services.map((svc, i) => (
            <ServiceRow
              key={svc.slug}
              index={i + 1}
              title={svc.title}
              blurb={svc.blurb}
              image={assets.serviceImages[svc.slug] ?? null}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ServiceRow({
  index,
  title,
  blurb,
  image,
}: {
  index: number;
  title: string;
  blurb: string;
  image: string | null;
}) {
  if (image) {
    return (
      <li className="grid grid-cols-12 items-center gap-x-4 py-10 sm:gap-x-8 sm:py-12">
        <p className="col-span-2 font-mono text-base text-neutral-500 sm:col-span-1 sm:text-lg">
          {String(index).padStart(2, "0")}
        </p>
        <div className="col-span-10 sm:col-span-7">
          <h3 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-4xl">
            {title}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
            {blurb}
          </p>
        </div>
        <div className="col-span-12 mt-4 sm:col-span-4 sm:mt-0">
          <MediaSlot src={image} alt={title} aspectRatio="4 / 3" />
        </div>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-12 items-baseline gap-x-4 py-10 sm:gap-x-8 sm:py-14 lg:py-16">
      <p className="col-span-2 font-mono text-base text-neutral-500 sm:col-span-1 sm:text-lg">
        {String(index).padStart(2, "0")}
      </p>
      <div className="col-span-10 sm:col-span-6 lg:col-span-5">
        <h3 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-4xl">
          {title}
        </h3>
      </div>
      <div className="col-span-12 mt-4 sm:col-span-5 sm:col-start-8 sm:mt-0 lg:col-span-6 lg:col-start-7">
        <p className="text-sm leading-relaxed text-neutral-400 sm:text-base">
          {blurb}
        </p>
      </div>
    </li>
  );
}

/* -------------------------------- PROCESS -------------------------------- */

function Process() {
  const steps = [
    {
      num: "01",
      title: "Submit",
      body:
        "Quote request through the form, by phone, or by email. Send what you know — we'll ask if we need more.",
    },
    {
      num: "02",
      title: "Price",
      body:
        "Direct quote from dispatch within hours. No bidding wars, no hidden fees, no markups on freight we don't move ourselves.",
    },
    {
      num: "03",
      title: "Book",
      body:
        "Approve the quote and we lock in pickup time, equipment, and a single point of contact.",
    },
    {
      num: "04",
      title: "Deliver",
      body:
        "Door-to-door. Driver updates en route. Paperwork delivered at offload.",
    },
  ];
  return (
    <section
      id="process"
      className="border-b border-neutral-800 bg-neutral-950 scroll-mt-16"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="py-14 lg:py-20">
          <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
            Process
          </p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Request to delivery.
          </h2>
        </header>

        <ol className="grid grid-cols-1 border-t border-neutral-800 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li
              key={step.num}
              className={
                "py-10 sm:px-6 lg:px-8 lg:py-12 " +
                (i > 0 ? "border-t border-neutral-800 sm:border-l " : "") +
                (i === 1 || i === 3 ? "sm:border-t-0 " : "") +
                (i >= 2 ? "lg:border-t-0 " : "")
              }
            >
              <p className="font-mono text-xs text-neutral-500">{step.num}</p>
              <h3 className="mt-3 text-2xl font-black uppercase tracking-tight text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------- ABOUT --------------------------------- */

function About() {
  const aboutSrc = assets.aboutImage;
  return (
    <section id="about" className="border-b border-neutral-800 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-x-12 gap-y-10 lg:grid-cols-12">
          <header className="lg:col-span-4">
            <p className="font-mono text-[11px] tracking-[0.22em] text-red-500 uppercase">
              Company
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              The carrier.
            </h2>
            {aboutSrc && (
              <div className="mt-8 hidden lg:block">
                <MediaSlot
                  src={aboutSrc}
                  alt={`${company.legalName}`}
                  aspectRatio="4 / 3"
                  position={assets.aboutImagePosition}
                />
              </div>
            )}
          </header>
          <div className="space-y-5 text-base leading-relaxed text-neutral-300 lg:col-span-8 lg:text-lg">
            {aboutSrc && (
              <div className="mb-6 lg:hidden">
                <MediaSlot
                  src={aboutSrc}
                  alt={`${company.legalName}`}
                  aspectRatio="4 / 3"
                  position={assets.aboutImagePosition}
                />
              </div>
            )}
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

            <dl className="grid grid-cols-2 gap-x-8 gap-y-5 border-t border-neutral-800 pt-8 sm:grid-cols-4">
              <Spec label="USDOT" value={company.dotNumber} />
              <Spec label="MC" value={company.mcNumber} />
              <Spec label="Operating" value={company.authorityText} />
              <Spec label="Dispatch" value={company.dispatchModel} />
            </dl>
          </div>
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
            <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
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
              className="block bg-red-600 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-red-500"
            >
              Request a Quote
            </Link>
            <a
              href={phoneHref}
              className="block border border-neutral-700 px-6 py-4 text-center text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors hover:border-neutral-500 hover:bg-neutral-900"
            >
              Call Dispatch
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
